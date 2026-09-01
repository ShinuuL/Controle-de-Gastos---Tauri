//! Comandos de conta na nuvem (fase 11/17).
//!
//! Desenho: `docs/superpowers/specs/2026-08-29-nuvem-sync-design.md`.
//!
//! **Toda chamada de rede da nuvem sai daqui, nunca do React.** O AGENTS.md
//! manda a nuvem passar por comandos Rust tipados; a cripto entra no mesmo
//! caminho, e com isso senha, KEK e DEK nunca existem no heap do JavaScript.
//!
//! O que atravessa a ponte para o front, no maximo, e: e-mail, `account_id` e
//! quando a sessao expira. Nada de token, nada de chave.

use std::sync::Mutex;

use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};

use crate::crypto::{
    self, derive_kek, derive_verifier, generate_dek, generate_salt, unwrap_dek, wrap_dek, KdfParams,
    Key,
};

/// Base do gateway. Vem do ambiente na hora de compilar para permitir apontar
/// para um Worker de teste sem editar codigo; sem a variavel, cai no gateway de
/// producao, que e o mesmo do `deploy.toml`.
const BASE_PADRAO: &str = "https://updates-gateway.sofaltaumaletr.workers.dev";

/// Chave publica Ed25519 que assina o entitlement, em hexa (32 bytes).
///
/// Gerar com `node scripts/gerar-chave-entitlement.mjs`, no gateway: a privada
/// vira secret do Worker, esta publica vem para ca. Publica nao e segredo e
/// pode ser versionada.
///
/// Par gerado em 2026-08-30. Trocar o par invalida todo entitlement em cache
/// nos aparelhos: eles voltam a precisar de rede uma vez, mas nenhuma conta se
/// perde.
const CHAVE_ENTITLEMENT: &str =
    "44a1c0afff3906182e1eb9e531d01051f19657533fe87c9cf96bc4d53b100cf3";

fn base_url() -> String {
    option_env!("CONTR0L_CLOUD_URL").unwrap_or(BASE_PADRAO).trim_end_matches('/').to_string()
}

/// Entitlement como o front consome. Espelha `src/features/auth/session.ts`.
#[derive(Debug, Clone, Serialize)]
pub struct Entitlement {
    pub status: String,
    pub expires_at: Option<String>,
    /// ISO 8601 carimbado pelo servidor.
    pub issued_at: String,
    /// A assinatura conferiu com a chave publica embutida?
    pub verificado: bool,
}

/// O que o front recebe depois de entrar. Deliberadamente magro.
#[derive(Debug, Clone, Serialize)]
pub struct Sessao {
    pub account_id: String,
    pub email: String,
    /// ISO 8601. Validade do TOKEN, nao do entitlement.
    pub expires_at: String,
}

/// Estado da sessao em memoria, espelhado em disco por `session_store`.
///
/// A decisao de persistir token e DEK na pasta privada do app, e o porque de
/// nao ser um keystore do SO, estao documentados em `session_store.rs`.
#[derive(Default)]
pub struct CloudState {
    sessao: Mutex<Option<SessaoInterna>>,
    /// Momento do ultimo push bem-sucedido, em segundos desde a epoca.
    /// Zero significa "nenhum nesta execucao".
    ultimo_push: Mutex<u64>,
}

struct SessaoInterna {
    token: String,
    resumo: Sessao,
    /// Fica em memoria porque e ela que cifra e decifra o backup. Ainda nao ha
    /// quem leia: o push/pull entra no proximo passo da spec. Guardar desde ja
    /// evita ter de pedir a senha de novo la.
    #[allow(dead_code)]
    dek: Key,
}

/// Erro que chega ao front. Mensagens em pt-BR, sem detalhe que ajude quem
/// esteja sondando o servidor.
#[derive(Debug, Serialize)]
pub struct CloudError {
    pub codigo: String,
    pub mensagem: String,
}

impl CloudError {
    fn nova(codigo: &str, mensagem: &str) -> Self {
        Self { codigo: codigo.into(), mensagem: mensagem.into() }
    }

    fn de_rede(_e: impl std::fmt::Display) -> Self {
        // A mensagem do reqwest pode conter URL e detalhe de TLS; nada disso
        // ajuda o usuario e parte disso vira ruido em tela.
        Self::nova("sem_conexao", "Nao foi possivel falar com o servidor. Verifique a internet.")
    }

    fn de_cripto(e: crypto::CryptoError) -> Self {
        Self::nova("cripto", &e.to_string())
    }
}

/// Traduz o codigo do gateway para uma frase que faca sentido em tela.
fn erro_do_gateway(status: u16, codigo: &str) -> CloudError {
    let mensagem = match codigo {
        "email_ja_cadastrado" => "Ja existe uma conta com este e-mail.",
        "credenciais_invalidas" => "E-mail ou senha incorretos.",
        "muitas_tentativas" => "Tentativas demais. Espere alguns minutos.",
        "sessao_invalida" => "Sua sessao expirou. Entre novamente.",
        "email_invalido" => "E-mail invalido.",
        "d1_ausente" | "params_secret_ausente" => "O servico de contas esta indisponivel.",
        _ if status >= 500 => "O servidor falhou. Tente de novo em instantes.",
        _ => "Nao foi possivel concluir. Tente de novo.",
    };
    CloudError::nova(codigo, mensagem)
}

/* ------------------------------------------------------------------- HTTP */

#[derive(Deserialize)]
struct RespostaErro {
    error: Option<String>,
}

#[derive(Deserialize)]
struct RespostaParams {
    salt_auth: String,
    salt_kek: String,
    kdf_params: String,
}

#[derive(Deserialize)]
struct RespostaSessao {
    token: String,
    expires_at: String,
    account_id: String,
    wrapped_dek: Option<String>,
}

async fn post_json<T: for<'de> Deserialize<'de>>(
    caminho: &str,
    corpo: serde_json::Value,
    token: Option<&str>,
) -> Result<T, CloudError> {
    let cliente = reqwest::Client::new();
    let mut req = cliente.post(format!("{}{caminho}", base_url())).json(&corpo);
    if let Some(t) = token {
        req = req.bearer_auth(t);
    }

    let resp = req.send().await.map_err(CloudError::de_rede)?;
    let status = resp.status().as_u16();
    let texto = resp.text().await.map_err(CloudError::de_rede)?;

    if !(200..300).contains(&status) {
        let codigo = serde_json::from_str::<RespostaErro>(&texto)
            .ok()
            .and_then(|e| e.error)
            .unwrap_or_else(|| "erro_desconhecido".into());
        return Err(erro_do_gateway(status, &codigo));
    }

    serde_json::from_str(&texto)
        .map_err(|_| CloudError::nova("resposta_invalida", "O servidor respondeu algo inesperado."))
}

/* -------------------------------------------------------------- derivacao */

/// Base64 sem padding, como o gateway valida (`[A-Za-z0-9+/=_-]`).
fn b64(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn de_b64(texto: &str) -> Result<Vec<u8>, CloudError> {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(texto)
        .map_err(|_| CloudError::nova("resposta_invalida", "O servidor respondeu algo inesperado."))
}

fn parse_kdf(texto: &str) -> Result<KdfParams, CloudError> {
    #[derive(Deserialize)]
    struct Bruto {
        m_cost: u32,
        t_cost: u32,
        p_cost: u32,
    }
    let b: Bruto = serde_json::from_str(texto)
        .map_err(|_| CloudError::nova("resposta_invalida", "O servidor respondeu algo inesperado."))?;
    Ok(KdfParams { m_cost: b.m_cost, t_cost: b.t_cost, p_cost: b.p_cost })
}

/* ----------------------------------------------------------------- comandos */

/// Cria a conta. A senha nao sai daqui: o que viaja e o verificador, um
/// derivado Argon2id com um salt diferente do que gera a KEK.
#[tauri::command]
pub async fn cloud_signup(
    app: tauri::AppHandle,
    estado: tauri::State<'_, CloudState>,
    email: String,
    senha: String,
) -> Result<Sessao, CloudError> {
    let params = KdfParams::default();
    let salt_auth = generate_salt();
    let salt_kek = generate_salt();

    let verificador = derive_verifier(&senha, &salt_auth, params).map_err(CloudError::de_cripto)?;
    let kek = derive_kek(&senha, &salt_kek, params).map_err(CloudError::de_cripto)?;
    let dek = generate_dek();
    let embrulhada = wrap_dek(&dek, &kek);

    let resp: RespostaSessao = post_json(
        "/v1/auth/signup",
        serde_json::json!({
            "email": email,
            "verificador": b64(verificador.as_ref()),
            "salt_auth": b64(&salt_auth),
            "salt_kek": b64(&salt_kek),
            "kdf_params": { "m_cost": params.m_cost, "t_cost": params.t_cost, "p_cost": params.p_cost },
            "wrapped_dek": b64(&embrulhada),
        }),
        None,
    )
    .await?;

    Ok(guardar_sessao(&app, &estado, resp, email, dek))
}

/// Entra na conta. Duas viagens, e nao uma, porque derivar o verificador exige
/// o salt, e o salt so o servidor tem -- ele responde salts falsos para e-mail
/// sem conta, entao esta primeira chamada nao denuncia quem tem conta.
#[tauri::command]
pub async fn cloud_login(
    app: tauri::AppHandle,
    estado: tauri::State<'_, CloudState>,
    email: String,
    senha: String,
) -> Result<Sessao, CloudError> {
    let params: RespostaParams =
        post_json("/v1/auth/params", serde_json::json!({ "email": email }), None).await?;

    let kdf = parse_kdf(&params.kdf_params)?;
    let salt_auth = de_b64(&params.salt_auth)?;
    let salt_kek = de_b64(&params.salt_kek)?;

    let verificador = derive_verifier(&senha, &salt_auth, kdf).map_err(CloudError::de_cripto)?;

    let resp: RespostaSessao = post_json(
        "/v1/auth/login",
        serde_json::json!({ "email": email, "verificador": b64(verificador.as_ref()) }),
        None,
    )
    .await?;

    // Desembrulhar a DEK e a prova real de que a senha esta certa: o servidor
    // conferiu o verificador, mas nao tem como saber se a KEK abre a DEK.
    let embrulhada = de_b64(
        resp.wrapped_dek
            .as_deref()
            .ok_or_else(|| CloudError::nova("resposta_invalida", "Conta sem chave de backup."))?,
    )?;
    let kek = derive_kek(&senha, &salt_kek, kdf).map_err(CloudError::de_cripto)?;
    let dek = unwrap_dek(&embrulhada, &kek).map_err(|_| {
        CloudError::nova(
            "backup_ilegivel",
            "A senha nao abre o backup desta conta. Se ela foi trocada em outro aparelho, use a senha nova.",
        )
    })?;

    Ok(guardar_sessao(&app, &estado, resp, email, dek))
}

/// Encerra a sessao no servidor e limpa a memoria. Nao falha se o servidor
/// estiver fora: sair localmente precisa funcionar sempre.
#[tauri::command]
pub async fn cloud_logout(
    app: tauri::AppHandle,
    estado: tauri::State<'_, CloudState>,
) -> Result<(), CloudError> {
    let token = { estado.sessao.lock().unwrap().as_ref().map(|s| s.token.clone()) };
    if let Some(token) = token {
        let _: Result<serde_json::Value, _> =
            post_json("/v1/auth/logout", serde_json::json!({}), Some(&token)).await;
    }
    *estado.sessao.lock().unwrap() = None;
    // Sair precisa apagar o arquivo, nao so a memoria: senao o proximo boot
    // ressuscitaria a sessao que o usuario acabou de encerrar.
    crate::session_store::limpar(&app);
    Ok(())
}

/// Palavra que o usuario digita para confirmar a exclusao, e que o gateway
/// exige no corpo do DELETE.
///
/// Dois botoes de "tem certeza?" nao seguram uma acao irreversivel; digitar
/// segura. E a confirmacao viaja para o servidor porque um `DELETE` disparado
/// por engano (ou por codigo que ninguem revisou) nao pode apagar uma conta so
/// por ter token valido.
pub const CONFIRMACAO_EXCLUSAO: &str = "APAGAR";

/// Apaga a conta no servidor e todo vestigio dela neste aparelho (LGPD art. 18).
///
/// **Os lancamentos NAO sao apagados.** Eles nunca foram meus: estao no SQLite
/// do aparelho e continuam la, funcionando sem conta como antes de existir uma.
/// O que se apaga e o que estava do meu lado -- conta, e-mail, sessoes e o
/// backup cifrado -- mais o que neste aparelho so servia para falar com ele:
/// a sessao em disco, o entitlement em cache e a versao do backup.
///
/// A ordem importa: primeiro o servidor, depois o local. Limpar antes deixaria
/// o usuario sem sessao e com a conta viva, sem caminho de volta para tentar de
/// novo. `404` conta como sucesso -- a conta ja nao existe, que e o pedido.
#[tauri::command]
pub async fn cloud_apagar_conta(
    app: tauri::AppHandle,
    estado: tauri::State<'_, CloudState>,
    confirmacao: String,
) -> Result<(), CloudError> {
    if confirmacao.trim().to_uppercase() != CONFIRMACAO_EXCLUSAO {
        return Err(CloudError::nova(
            "confirmacao_invalida",
            "Digite APAGAR para confirmar a exclusao da conta.",
        ));
    }

    let token = { estado.sessao.lock().unwrap().as_ref().map(|s| s.token.clone()) }
        .ok_or_else(|| CloudError::nova("sem_sessao", "Entre na conta que voce quer apagar."))?;

    let resp = reqwest::Client::new()
        .delete(format!("{}/v1/me", base_url()))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "confirmacao": CONFIRMACAO_EXCLUSAO }))
        .send()
        .await
        .map_err(CloudError::de_rede)?;

    let status = resp.status().as_u16();
    if !(200..300).contains(&status) && status != 404 {
        let texto = resp.text().await.unwrap_or_default();
        let codigo = serde_json::from_str::<RespostaErro>(&texto)
            .ok()
            .and_then(|e| e.error)
            .unwrap_or_else(|| "erro_desconhecido".into());
        return Err(erro_do_gateway(status, &codigo));
    }

    *estado.sessao.lock().unwrap() = None;
    crate::session_store::limpar(&app);
    let _ = limpar_vestigios_locais(&app).await;
    Ok(())
}

/// Apaga do banco local as duas tabelas que existem so por causa da conta.
///
/// Nao volta erro para o comando: a conta ja foi apagada no servidor quando
/// isto roda, e falhar aqui nao desfaz aquilo. O pior caso e um cache orfao,
/// que a proxima conta sobrescreve -- e o entitlement em cache e inutil sozinho,
/// porque a leitura reconfere a assinatura contra a conta.
async fn limpar_vestigios_locais(app: &tauri::AppHandle) -> Result<(), String> {
    let pool = crate::recovery::abrir(app).await?;
    for sql in ["DELETE FROM cloud_entitlement", "DELETE FROM cloud_backup_state"] {
        sqlx::query(sql)
            .execute(&pool)
            .await
            .map_err(|_| "falha ao limpar o estado da nuvem".to_string())?;
    }
    Ok(())
}

/// Sessao atual, para a UI saber o que mostrar no boot. Sem rede.
#[tauri::command]
pub fn cloud_sessao(
    app: tauri::AppHandle,
    estado: tauri::State<'_, CloudState>,
) -> Option<Sessao> {
    restaurar_sessao(&app, &estado)
}

fn guardar_sessao(
    app: &tauri::AppHandle,
    estado: &tauri::State<'_, CloudState>,
    resp: RespostaSessao,
    email: String,
    dek: Key,
) -> Sessao {
    let resumo = Sessao { account_id: resp.account_id, email, expires_at: resp.expires_at };

    crate::session_store::salvar(
        app,
        &crate::session_store::SessaoPersistida {
            token: resp.token.clone(),
            account_id: resumo.account_id.clone(),
            email: resumo.email.clone(),
            expires_at: resumo.expires_at.clone(),
            dek: b64(dek.as_ref()),
        },
    );

    *estado.sessao.lock().unwrap() =
        Some(SessaoInterna { token: resp.token, resumo: resumo.clone(), dek });
    resumo
}

/// Recoloca em memoria a sessao gravada em disco.
///
/// Chamado sob demanda, e nao no boot: assim o custo (ler um arquivo pequeno)
/// so aparece para quem tem conta, e quem nunca cadastrou nao paga nada.
fn restaurar_sessao(app: &tauri::AppHandle, estado: &tauri::State<'_, CloudState>) -> Option<Sessao> {
    if let Some(s) = estado.sessao.lock().unwrap().as_ref() {
        return Some(s.resumo.clone());
    }

    let guardada = crate::session_store::carregar(app)?;
    let bytes = de_b64(&guardada.dek).ok()?;
    if bytes.len() != 32 {
        // Arquivo adulterado ou de outro formato. Apagar e melhor que insistir:
        // uma DEK errada so produziria "backup ilegivel" para sempre.
        crate::session_store::limpar(app);
        return None;
    }
    let mut dek: Key = zeroize::Zeroizing::new([0u8; 32]);
    dek.copy_from_slice(&bytes);

    let resumo = Sessao {
        account_id: guardada.account_id,
        email: guardada.email,
        expires_at: guardada.expires_at,
    };
    *estado.sessao.lock().unwrap() =
        Some(SessaoInterna { token: guardada.token, resumo: resumo.clone(), dek });
    Some(resumo)
}

/* -------------------------------------------------------------- entitlement */

#[derive(Deserialize)]
struct RespostaEntitlement {
    status: String,
    expires_at: Option<String>,
    issued_at: String,
    signature: Option<String>,
    account_id: Option<String>,
}

/// Texto exatamente como o Worker assina (`entitlement.js`). Campo a campo,
/// separado por "|": JSON teria ordem de chaves e espaco variaveis, e a
/// assinatura confere BYTES.
fn payload_assinado(account_id: &str, status: &str, expires_at: &str, issued_at: &str) -> String {
    format!("{account_id}|{status}|{expires_at}|{issued_at}")
}

fn chave_publica() -> Option<VerifyingKey> {
    if CHAVE_ENTITLEMENT.len() != 64 {
        return None;
    }
    let mut bytes = [0u8; 32];
    for (i, par) in CHAVE_ENTITLEMENT.as_bytes().chunks(2).enumerate() {
        let hex = std::str::from_utf8(par).ok()?;
        bytes[i] = u8::from_str_radix(hex, 16).ok()?;
    }
    VerifyingKey::from_bytes(&bytes).ok()
}

/// Confere a assinatura. Devolve `false` -- nunca erro -- quando nao ha chave
/// embutida ou assinatura na resposta: isso nao e falha, e "nao da para confiar
/// offline", e quem decide o que fazer com isso e a regra em session.ts.
fn assinatura_confere(conta_esperada: &str, r: &RespostaEntitlement) -> bool {
    confere_com(chave_publica(), conta_esperada, r)
}

/// A chave entra por parametro para o teste poder assinar com um par
/// descartavel -- a const embutida so e conhecida em producao.
fn confere_com(chave: Option<VerifyingKey>, conta_esperada: &str, r: &RespostaEntitlement) -> bool {
    let (Some(chave), Some(assinatura)) = (chave, r.signature.as_deref()) else {
        return false;
    };
    // O servidor precisa ter assinado ESTA conta. Sem isto, o assinado de uma
    // conta paga serviria para qualquer outra -- bastaria copiar o arquivo.
    if r.account_id.as_deref() != Some(conta_esperada) {
        return false;
    }

    let Ok(bytes) = de_b64_padded(assinatura) else { return false };
    let Ok(assinatura) = Signature::from_slice(&bytes) else { return false };
    let texto = payload_assinado(
        conta_esperada,
        &r.status,
        r.expires_at.as_deref().unwrap_or(""),
        &r.issued_at,
    );
    chave.verify_strict(texto.as_bytes(), &assinatura).is_ok()
}

/// A assinatura vem em base64 COM padding (btoa), diferente dos campos de
/// cripto, que usam URL-safe sem padding.
fn de_b64_padded(texto: &str) -> Result<Vec<u8>, CloudError> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(texto)
        .map_err(|_| CloudError::nova("resposta_invalida", "O servidor respondeu algo inesperado."))
}

async fn get_json<T: for<'de> Deserialize<'de>>(
    caminho: &str,
    token: &str,
) -> Result<T, CloudError> {
    let resp = reqwest::Client::new()
        .get(format!("{}{caminho}", base_url()))
        .bearer_auth(token)
        .send()
        .await
        .map_err(CloudError::de_rede)?;
    let status = resp.status().as_u16();
    let texto = resp.text().await.map_err(CloudError::de_rede)?;

    if !(200..300).contains(&status) {
        let codigo = serde_json::from_str::<RespostaErro>(&texto)
            .ok()
            .and_then(|e| e.error)
            .unwrap_or_else(|| "erro_desconhecido".into());
        return Err(erro_do_gateway(status, &codigo));
    }
    serde_json::from_str(&texto)
        .map_err(|_| CloudError::nova("resposta_invalida", "O servidor respondeu algo inesperado."))
}

/// Estado do pagamento. Busca no servidor; se nao houver rede ou sessao, cai no
/// ultimo estado guardado, que so vale enquanto a carencia da spec permitir --
/// quem decide isso e `decideAccess()`, no front.
#[tauri::command]
pub async fn cloud_entitlement(
    app: tauri::AppHandle,
    estado: tauri::State<'_, CloudState>,
) -> Result<Option<Entitlement>, CloudError> {
    let sessao = { estado.sessao.lock().unwrap().as_ref().map(|s| (s.token.clone(), s.resumo.account_id.clone())) };

    let Some((token, account_id)) = sessao else {
        // Sem sessao em memoria (app recem-aberto), o cache e tudo que ha.
        return Ok(ler_cache(&app).await);
    };

    match get_json::<RespostaEntitlement>("/v1/me/entitlement", &token).await {
        Ok(resp) => {
            let verificado = assinatura_confere(&account_id, &resp);
            // So vai para o cache o que veio assinado e conferido: guardar o
            // resto encheria o banco de estado que nao serve para carencia.
            if verificado {
                let _ = gravar_cache(&app, &account_id, &resp).await;
            }
            Ok(Some(Entitlement {
                status: resp.status,
                expires_at: resp.expires_at,
                issued_at: resp.issued_at,
                verificado,
            }))
        }
        // Servidor fora do ar nao pode fechar funcao paga na hora: e para isso
        // que a carencia existe.
        Err(e) if e.codigo == "sem_conexao" => Ok(ler_cache(&app).await),
        Err(e) => Err(e),
    }
}

async fn ler_cache(app: &tauri::AppHandle) -> Option<Entitlement> {
    let pool = crate::recovery::abrir(app).await.ok()?;
    let linha = sqlx::query(
        "SELECT account_id, status, expires_at, issued_at, signature FROM cloud_entitlement WHERE id = 1",
    )
    .fetch_optional(&pool)
    .await
    .ok()??;

    use sqlx::Row;
    let resp = RespostaEntitlement {
        status: linha.get("status"),
        expires_at: linha.get("expires_at"),
        issued_at: linha.get("issued_at"),
        signature: linha.get("signature"),
        account_id: Some(linha.get::<String, _>("account_id")),
    };
    let conta: String = linha.get("account_id");

    // Reconfere a assinatura NA LEITURA, e nao so na gravacao: e exatamente
    // aqui que a edicao manual do arquivo apareceria.
    let verificado = assinatura_confere(&conta, &resp);
    Some(Entitlement {
        status: resp.status,
        expires_at: resp.expires_at,
        issued_at: resp.issued_at,
        verificado,
    })
}

async fn gravar_cache(
    app: &tauri::AppHandle,
    account_id: &str,
    r: &RespostaEntitlement,
) -> Result<(), String> {
    let pool = crate::recovery::abrir(app).await?;
    sqlx::query(
        "INSERT INTO cloud_entitlement (id, account_id, status, expires_at, issued_at, signature)
         VALUES (1, $1, $2, $3, $4, $5)
         ON CONFLICT(id) DO UPDATE SET
           account_id = excluded.account_id, status = excluded.status,
           expires_at = excluded.expires_at, issued_at = excluded.issued_at,
           signature = excluded.signature",
    )
    .bind(account_id)
    .bind(&r.status)
    .bind(&r.expires_at)
    .bind(&r.issued_at)
    .bind(&r.signature)
    .execute(&pool)
    .await
    .map(|_| ())
    .map_err(|_| "falha ao gravar o entitlement".to_string())
}

/* ------------------------------------------------------------------ backup */

/// Resultado de um envio.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ResultadoPush {
    /// Subiu. `version` e a nova versao no servidor.
    Enviado { version: i64, bytes: usize },
    /// Outro aparelho gravou depois da ultima sincronizacao deste.
    ///
    /// **Nao funde e nao sobrescreve.** Fundir dois bancos inteiros sem o
    /// servidor poder ler nenhum dos dois e o problema mais caro do projeto, e
    /// adia-lo com honestidade e melhor que resolve-lo errado em silencio.
    Conflito { version_servidor: i64, version_local: i64 },
}

/// Resultado de uma restauracao.
#[derive(Debug, Serialize)]
pub struct ResultadoPull {
    pub version: i64,
    pub bytes: usize,
    /// Sempre true: a troca do arquivo so acontece no proximo boot.
    pub exige_reinicio: bool,
}

/// Sufixo do arquivo que espera a troca no proximo boot.
const SUFIXO_RESTAURAR: &str = "restaurar";
/// Copia do banco anterior, guardada antes de qualquer troca.
const SUFIXO_ANTERIOR: &str = "anterior";

/// Caminho do banco baixado que aguarda a troca.
fn caminho_pendente(banco: &std::path::Path) -> std::path::PathBuf {
    banco.with_extension(SUFIXO_RESTAURAR)
}

/// Caminho da copia do banco anterior a uma restauracao.
fn caminho_anterior(banco: &std::path::Path) -> std::path::PathBuf {
    banco.with_extension(SUFIXO_ANTERIOR)
}

/// Sobe o banco cifrado.
#[tauri::command]
pub async fn cloud_backup_push(
    app: tauri::AppHandle,
    estado: tauri::State<'_, CloudState>,
) -> Result<ResultadoPush, CloudError> {
    let (token, account_id, dek) = credenciais(&estado)?;

    let caminho = crate::recovery::caminho_do_banco(&app)
        .map_err(|_| CloudError::nova("banco_ausente", "Nao foi possivel ler o banco local."))?;
    let conteudo = std::fs::read(&caminho)
        .map_err(|_| CloudError::nova("banco_ausente", "Nao foi possivel ler o banco local."))?;

    // Cifra ANTES de qualquer coisa tocar a rede. O que sai do processo daqui
    // para frente ja e opaco.
    let envelope = crate::crypto::seal_envelope(&conteudo, &dek);
    let base = ler_versao_local(&app, &account_id).await.unwrap_or(0);

    let resp = reqwest::Client::new()
        .put(format!("{}/v1/backup", base_url()))
        .bearer_auth(&token)
        .header("if-match", base.to_string())
        .header("content-type", "application/octet-stream")
        .body(envelope.clone())
        .send()
        .await
        .map_err(CloudError::de_rede)?;

    let status = resp.status().as_u16();
    let texto = resp.text().await.map_err(CloudError::de_rede)?;

    if status == 409 {
        #[derive(Deserialize)]
        struct Conflito {
            version: i64,
        }
        let c: Conflito = serde_json::from_str(&texto).map_err(|_| {
            CloudError::nova("resposta_invalida", "O servidor respondeu algo inesperado.")
        })?;
        return Ok(ResultadoPush::Conflito {
            version_servidor: c.version,
            version_local: base,
        });
    }
    if !(200..300).contains(&status) {
        let codigo = serde_json::from_str::<RespostaErro>(&texto)
            .ok()
            .and_then(|e| e.error)
            .unwrap_or_else(|| "erro_desconhecido".into());
        return Err(erro_do_gateway(status, &codigo));
    }

    #[derive(Deserialize)]
    struct VersaoNova {
        version: i64,
    }
    let ok: VersaoNova = serde_json::from_str(&texto).map_err(|_| {
        CloudError::nova("resposta_invalida", "O servidor respondeu algo inesperado.")
    })?;
    let _ = gravar_versao_local(&app, &account_id, ok.version).await;

    Ok(ResultadoPush::Enviado { version: ok.version, bytes: envelope.len() })
}

/// Baixa e decifra o backup, deixando-o pronto para a troca no proximo boot.
///
/// **Nao escreve por cima do banco em uso.** O SQLite esta aberto: trocar o
/// arquivo debaixo de uma conexao viva corrompe o banco de formas que so
/// aparecem depois. O arquivo decifrado espera com a extensao `.restaurar`, e a
/// troca acontece no `setup` do Tauri, antes de qualquer conexao existir.
#[tauri::command]
pub async fn cloud_backup_pull(
    app: tauri::AppHandle,
    estado: tauri::State<'_, CloudState>,
) -> Result<ResultadoPull, CloudError> {
    let (token, account_id, dek) = credenciais(&estado)?;

    let resp = reqwest::Client::new()
        .get(format!("{}/v1/backup", base_url()))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(CloudError::de_rede)?;

    let status = resp.status().as_u16();
    if status == 404 {
        return Err(CloudError::nova("sem_backup", "Esta conta ainda nao tem backup na nuvem."));
    }
    if !(200..300).contains(&status) {
        return Err(erro_do_gateway(status, "erro_desconhecido"));
    }

    let versao: i64 = resp
        .headers()
        .get("x-backup-version")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let envelope = resp.bytes().await.map_err(CloudError::de_rede)?;

    // Senha errada, backup de outra conta ou arquivo adulterado morrem aqui,
    // ANTES de qualquer coisa ser escrita em disco.
    let conteudo = crate::crypto::open_envelope(&envelope, &dek).map_err(|_| {
        CloudError::nova(
            "backup_ilegivel",
            "Nao foi possivel abrir o backup com a senha desta conta.",
        )
    })?;

    let caminho = crate::recovery::caminho_do_banco(&app)
        .map_err(|_| CloudError::nova("banco_ausente", "Nao foi possivel acessar o banco local."))?;
    std::fs::write(caminho_pendente(&caminho), &conteudo).map_err(|_| {
        CloudError::nova("falha_ao_gravar", "Nao foi possivel gravar o backup baixado.")
    })?;

    let _ = gravar_versao_local(&app, &account_id, versao).await;

    Ok(ResultadoPull { version: versao, bytes: conteudo.len(), exige_reinicio: true })
}

/// Troca o banco pelo backup baixado, se houver um esperando.
///
/// Roda no `setup`, antes de a webview carregar e antes de qualquer conexao
/// SQLite existir. O banco anterior e preservado: uma restauracao que se revele
/// errada nao pode ser um caminho sem volta.
pub fn aplicar_restauracao_pendente(app: &tauri::AppHandle) {
    let Ok(caminho) = crate::recovery::caminho_do_banco(app) else {
        return;
    };
    trocar_se_pendente(&caminho);
}

/// Separado do comando para poder ser testado com arquivos de verdade, sem
/// AppHandle nem Tauri no meio.
fn trocar_se_pendente(banco: &std::path::Path) -> bool {
    let pendente = caminho_pendente(banco);
    if !pendente.exists() {
        return false;
    }

    if banco.exists() {
        // Falhou a copia do atual? Entao nao troca. Perder o banco local para
        // restaurar outro seria trocar um problema por um pior.
        if std::fs::copy(banco, caminho_anterior(banco)).is_err() {
            return false;
        }
    }
    std::fs::rename(&pendente, banco).is_ok()
}

fn credenciais(estado: &tauri::State<'_, CloudState>) -> Result<(String, String, Key), CloudError> {
    let guarda = estado.sessao.lock().unwrap();
    let s = guarda
        .as_ref()
        .ok_or_else(|| CloudError::nova("sem_sessao", "Entre na sua conta para usar o backup."))?;
    Ok((s.token.clone(), s.resumo.account_id.clone(), s.dek.clone()))
}

async fn ler_versao_local(app: &tauri::AppHandle, account_id: &str) -> Option<i64> {
    let pool = crate::recovery::abrir(app).await.ok()?;
    // O `account_id` no WHERE nao e enfeite: entrar com outra conta neste
    // aparelho zera a base, e o push seguinte vira "acho que nao existe backup"
    // -- que o servidor recusa com 409 se existir. Sem isso, a versao de uma
    // conta autorizaria sobrescrever o backup de outra.
    let linha =
        sqlx::query("SELECT version FROM cloud_backup_state WHERE id = 1 AND account_id = $1")
            .bind(account_id)
            .fetch_optional(&pool)
            .await
            .ok()??;
    use sqlx::Row;
    Some(linha.get("version"))
}

async fn gravar_versao_local(
    app: &tauri::AppHandle,
    account_id: &str,
    versao: i64,
) -> Result<(), String> {
    let pool = crate::recovery::abrir(app).await?;
    sqlx::query(
        "INSERT INTO cloud_backup_state (id, account_id, version, synced_at)
         VALUES (1, $1, $2, $3)
         ON CONFLICT(id) DO UPDATE SET
           account_id = excluded.account_id, version = excluded.version,
           synced_at = excluded.synced_at",
    )
    .bind(account_id)
    .bind(versao)
    .bind(agora_iso())
    .execute(&pool)
    .await
    .map(|_| ())
    .map_err(|_| "falha ao gravar a versao do backup".to_string())
}

/// Segundos desde a epoca, em texto. Basta para dizer "quando foi o ultimo
/// sync" e evita puxar a `chrono` so para isto.
fn agora_iso() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        .to_string()
}

/* ------------------------------------------------------- push automatico */

/// Intervalo minimo entre dois pushes automaticos.
///
/// Uma hora nao e conservadorismo: o KV do plano gratuito da 1.000 escritas por
/// dia para a conta inteira. Push a cada mudanca esgotaria isso com um punhado
/// de usuarios ativos, e o sintoma seria backup parando de funcionar para
/// todos, nao so para quem gastou.
const INTERVALO_PUSH_SEGUNDOS: u64 = 3600;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ResultadoAuto {
    /// Subiu agora.
    Enviado { version: i64 },
    /// Ainda dentro da janela do ultimo envio.
    Cedo { faltam_segundos: u64 },
    /// Sem conta conectada -- o caso de quem nunca cadastrou.
    SemSessao,
    /// Tentou e nao deu. Nao e erro para o usuario: o proximo gatilho tenta de
    /// novo, e o dado continua inteiro no aparelho.
    Adiado { motivo: String },
}

fn agora_em_segundos() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Sobe o backup se ja passou tempo suficiente desde o ultimo envio.
///
/// **Nunca falha para o usuario.** Backup que da errado em segundo plano vira
/// aviso silencioso, nao popup: os dados estao no aparelho e o proximo gatilho
/// tenta de novo. Erro so aparece quando foi ele quem pediu (o botao "Enviar
/// agora").
#[tauri::command]
pub async fn cloud_backup_auto(
    app: tauri::AppHandle,
    estado: tauri::State<'_, CloudState>,
) -> Result<ResultadoAuto, CloudError> {
    if restaurar_sessao(&app, &estado).is_none() {
        return Ok(ResultadoAuto::SemSessao);
    }

    let agora = agora_em_segundos();
    {
        let ultimo = *estado.ultimo_push.lock().unwrap();
        let decorrido = agora.saturating_sub(ultimo);
        if ultimo != 0 && decorrido < INTERVALO_PUSH_SEGUNDOS {
            return Ok(ResultadoAuto::Cedo {
                faltam_segundos: INTERVALO_PUSH_SEGUNDOS - decorrido,
            });
        }
    }

    match cloud_backup_push(app, estado.clone()).await {
        Ok(ResultadoPush::Enviado { version, .. }) => {
            *estado.ultimo_push.lock().unwrap() = agora;
            Ok(ResultadoAuto::Enviado { version })
        }
        // Conflito em push automatico NAO vira tela: resolver exige decisao do
        // usuario, e interromper alguem que so abriu o app para ver um saldo
        // seria pior que esperar ele mesmo tentar enviar.
        Ok(ResultadoPush::Conflito { version_servidor, .. }) => Ok(ResultadoAuto::Adiado {
            motivo: format!("conflito com a versao {version_servidor} do servidor"),
        }),
        Err(e) => Ok(ResultadoAuto::Adiado { motivo: e.codigo }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_url_nao_termina_com_barra() {
        // Concatenar "/v1/auth/login" numa base com barra final gera "//v1",
        // que o Worker roteia como caminho vazio.
        assert!(!base_url().ends_with('/'));
        assert!(base_url().starts_with("https://"));
    }

    #[test]
    fn b64_faz_round_trip_sem_padding() {
        // O gateway recusa caractere fora de [A-Za-z0-9+/=_-]; URL_SAFE_NO_PAD
        // cabe nisso, e "=" ficaria sobrando a toa.
        let bytes = [0u8, 1, 250, 251, 252, 253, 254, 255];
        let texto = b64(&bytes);
        assert!(!texto.contains('='));
        assert_eq!(de_b64(&texto).unwrap(), bytes);
    }

    #[test]
    fn b64_invalido_vira_erro_e_nao_panico() {
        assert_eq!(de_b64("nao é base64!").unwrap_err().codigo, "resposta_invalida");
    }

    #[test]
    fn kdf_do_servidor_e_lido() {
        let p = parse_kdf(r#"{"m_cost":65536,"t_cost":3,"p_cost":1}"#).unwrap();
        assert_eq!(p, KdfParams { m_cost: 65536, t_cost: 3, p_cost: 1 });
    }

    #[test]
    fn kdf_malformado_nao_derruba_o_login() {
        assert_eq!(parse_kdf("{}").unwrap_err().codigo, "resposta_invalida");
    }

    #[test]
    fn a_confirmacao_da_exclusao_aceita_espaco_e_caixa_mas_nao_outra_palavra() {
        // O comando compara com esta mesma regra antes de tocar a rede. Digitar
        // "apagar" com a tecla de maiuscula desligada nao pode ser recusado; e
        // "apaga" ou vazio nao pode passar.
        let vale = |digitado: &str| digitado.trim().to_uppercase() == CONFIRMACAO_EXCLUSAO;
        assert!(vale("APAGAR"));
        assert!(vale("apagar"));
        assert!(vale("  Apagar  "));
        assert!(!vale("apaga"));
        assert!(!vale("APAGAR TUDO"));
        assert!(!vale(""));
    }

    #[test]
    fn erros_do_gateway_viram_frase_em_pt_br() {
        assert_eq!(erro_do_gateway(409, "email_ja_cadastrado").mensagem, "Ja existe uma conta com este e-mail.");
        assert_eq!(erro_do_gateway(401, "credenciais_invalidas").mensagem, "E-mail ou senha incorretos.");
        // Codigo novo que o gateway invente nao pode virar tela em branco.
        assert!(!erro_do_gateway(400, "codigo_que_nao_existe").mensagem.is_empty());
        assert!(erro_do_gateway(500, "boom").mensagem.contains("servidor"));
    }

    #[test]
    fn erro_de_rede_nao_vaza_detalhe_de_tls_ou_url() {
        let e = CloudError::de_rede("erro em https://gw.exemplo/v1/auth/login: certificate expired");
        assert_eq!(e.codigo, "sem_conexao");
        assert!(!e.mensagem.contains("https://"));
    }

    #[test]
    fn o_ciclo_de_credenciais_do_signup_fecha() {
        // Reproduz o que cloud_signup monta e o que cloud_login desfaz, sem rede:
        // se o par de salts ou o embrulho estiverem trocados, isto quebra.
        let params = KdfParams { m_cost: 8, t_cost: 1, p_cost: 1 };
        let salt_auth = generate_salt();
        let salt_kek = generate_salt();
        let dek = generate_dek();

        let kek = derive_kek("senha", &salt_kek, params).unwrap();
        let embrulhada = wrap_dek(&dek, &kek);
        let verificador = derive_verifier("senha", &salt_auth, params).unwrap();

        // O que o servidor guardaria nao serve para abrir a DEK.
        assert_ne!(verificador.as_ref(), kek.as_ref());

        // No login, a mesma senha com o salt_kek devolvido reabre a DEK.
        let kek_de_volta = derive_kek("senha", &salt_kek, params).unwrap();
        assert_eq!(unwrap_dek(&embrulhada, &kek_de_volta).unwrap().as_ref(), dek.as_ref());

        // Senha errada passa longe, mesmo com todos os salts em maos.
        let kek_errada = derive_kek("senha errada", &salt_kek, params).unwrap();
        assert!(unwrap_dek(&embrulhada, &kek_errada).is_err());
    }

    /* ------------------------------------------------------------- entitlement */

    use ed25519_dalek::{Signer, SigningKey};

    fn resposta(status: &str, conta: &str) -> RespostaEntitlement {
        RespostaEntitlement {
            status: status.into(),
            expires_at: None,
            issued_at: "2026-08-29T12:00:00.000Z".into(),
            signature: None,
            account_id: Some(conta.into()),
        }
    }

    fn assina(chave: &SigningKey, conta: &str, r: &mut RespostaEntitlement) {
        use base64::Engine;
        let texto = payload_assinado(
            conta,
            &r.status,
            r.expires_at.as_deref().unwrap_or(""),
            &r.issued_at,
        );
        let assinatura = chave.sign(texto.as_bytes());
        r.signature =
            Some(base64::engine::general_purpose::STANDARD.encode(assinatura.to_bytes()));
    }

    #[test]
    fn o_payload_e_byte_a_byte_o_que_o_worker_assina() {
        // Contrato entre duas linguagens: entitlement.js monta esta MESMA
        // string. Mudar um separador aqui quebra toda carencia em campo, e o
        // sintoma seria "parou de funcionar offline", nao um erro de compilacao.
        assert_eq!(
            payload_assinado("conta-1", "ativo", "", "2026-08-29T12:00:00.000Z"),
            "conta-1|ativo||2026-08-29T12:00:00.000Z"
        );
        assert_eq!(
            payload_assinado("conta-1", "expirado", "2026-09-28T00:00:00.000Z", "2026-08-29T12:00:00.000Z"),
            "conta-1|expirado|2026-09-28T00:00:00.000Z|2026-08-29T12:00:00.000Z"
        );
    }

    #[test]
    fn assinatura_valida_confere() {
        let chave = SigningKey::from_bytes(&[7u8; 32]);
        let mut r = resposta("ativo", "conta-1");
        assina(&chave, "conta-1", &mut r);

        assert!(confere_com(Some(chave.verifying_key()), "conta-1", &r));
    }

    #[test]
    fn assinatura_de_outra_conta_nao_serve() {
        // Copiar o arquivo de cache de um aparelho pago para outro nao pode
        // liberar nada.
        let chave = SigningKey::from_bytes(&[7u8; 32]);
        let mut r = resposta("ativo", "conta-paga");
        assina(&chave, "conta-paga", &mut r);
        r.account_id = Some("conta-caloteira".into());

        assert!(!confere_com(Some(chave.verifying_key()), "conta-caloteira", &r));
    }

    #[test]
    fn status_editado_no_banco_e_pego_na_leitura() {
        // O caso barato que a assinatura existe para impedir: abrir o SQLite e
        // trocar 'revogado' por 'ativo'.
        let chave = SigningKey::from_bytes(&[7u8; 32]);
        let mut r = resposta("revogado", "conta-1");
        assina(&chave, "conta-1", &mut r);
        r.status = "ativo".into();

        assert!(!confere_com(Some(chave.verifying_key()), "conta-1", &r));
    }

    #[test]
    fn validade_esticada_nao_confere() {
        let chave = SigningKey::from_bytes(&[7u8; 32]);
        let mut r = resposta("ativo", "conta-1");
        r.expires_at = Some("2026-09-01T00:00:00.000Z".into());
        assina(&chave, "conta-1", &mut r);
        r.expires_at = Some("2099-01-01T00:00:00.000Z".into());

        assert!(!confere_com(Some(chave.verifying_key()), "conta-1", &r));
    }

    #[test]
    fn chave_de_outro_par_nao_confere() {
        let chave = SigningKey::from_bytes(&[7u8; 32]);
        let intrusa = SigningKey::from_bytes(&[9u8; 32]);
        let mut r = resposta("ativo", "conta-1");
        assina(&intrusa, "conta-1", &mut r);

        assert!(!confere_com(Some(chave.verifying_key()), "conta-1", &r));
    }

    #[test]
    fn sem_chave_embutida_nada_e_verificado() {
        // Um build sem a chave continua funcionando, so que sem carencia
        // offline. E o correto: sem chave nao ha como distinguir o servidor de
        // verdade de qualquer outro.
        let chave = SigningKey::from_bytes(&[7u8; 32]);
        let mut r = resposta("ativo", "conta-1");
        assina(&chave, "conta-1", &mut r);

        assert!(!confere_com(None, "conta-1", &r));
    }

    #[test]
    fn resposta_sem_assinatura_nao_e_verificada() {
        let chave = SigningKey::from_bytes(&[7u8; 32]);
        let r = resposta("ativo", "conta-1");

        assert!(!confere_com(Some(chave.verifying_key()), "conta-1", &r));
    }

    #[test]
    fn assinatura_ilegivel_nao_derruba_o_app() {
        let chave = SigningKey::from_bytes(&[7u8; 32]);
        let mut r = resposta("ativo", "conta-1");
        r.signature = Some("isto nao e base64".into());

        assert!(!confere_com(Some(chave.verifying_key()), "conta-1", &r));

        r.signature = Some("Y3VydG8".into()); // base64 valido, tamanho errado
        assert!(!confere_com(Some(chave.verifying_key()), "conta-1", &r));
    }

    #[test]
    fn a_chave_embutida_e_valida() {
        // Colar hexa errado no const nao pode virar panico no boot -- viraria
        // None e o app so perderia a carencia. Este teste existe para o erro
        // aparecer aqui, e nao em campo.
        assert!(
            chave_publica().is_some(),
            "CHAVE_ENTITLEMENT nao e uma chave Ed25519 valida em hexa"
        );
        assert_eq!(CHAVE_ENTITLEMENT.len(), 64);
    }

    /* ------------------------------------------------------------------ backup */

    use std::path::PathBuf;

    /// Pasta temporaria propria, para os testes nao disputarem arquivo.
    fn pasta(nome: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("contr0l-teste-{nome}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("criar pasta de teste");
        dir
    }

    #[test]
    fn sem_arquivo_pendente_nada_e_trocado() {
        let dir = pasta("sem-pendente");
        let banco = dir.join("controle-de-gastos.db");
        std::fs::write(&banco, b"banco original").unwrap();

        assert!(!trocar_se_pendente(&banco));
        assert_eq!(std::fs::read(&banco).unwrap(), b"banco original");
    }

    #[test]
    fn restauracao_pendente_substitui_o_banco_e_guarda_o_anterior() {
        let dir = pasta("troca");
        let banco = dir.join("controle-de-gastos.db");
        std::fs::write(&banco, b"banco original").unwrap();
        std::fs::write(caminho_pendente(&banco), b"banco restaurado").unwrap();

        assert!(trocar_se_pendente(&banco));

        assert_eq!(std::fs::read(&banco).unwrap(), b"banco restaurado");
        // Uma restauracao que se revele errada nao pode ser caminho sem volta.
        assert_eq!(std::fs::read(caminho_anterior(&banco)).unwrap(), b"banco original");
        // O pendente sai do caminho: senao a troca se repetiria a cada boot,
        // desfazendo tudo que o usuario fizesse depois de restaurar.
        assert!(!caminho_pendente(&banco).exists());
    }

    #[test]
    fn a_troca_nao_se_repete_no_boot_seguinte() {
        let dir = pasta("uma-vez");
        let banco = dir.join("controle-de-gastos.db");
        std::fs::write(&banco, b"original").unwrap();
        std::fs::write(caminho_pendente(&banco), b"restaurado").unwrap();

        assert!(trocar_se_pendente(&banco));
        std::fs::write(&banco, b"trabalho feito depois de restaurar").unwrap();

        assert!(!trocar_se_pendente(&banco));
        assert_eq!(std::fs::read(&banco).unwrap(), b"trabalho feito depois de restaurar");
    }

    #[test]
    fn instalacao_nova_aceita_restauracao_sem_banco_anterior() {
        // Reinstalou o app e entrou na conta: nao existe banco local ainda.
        let dir = pasta("instalacao-nova");
        let banco = dir.join("controle-de-gastos.db");
        std::fs::write(caminho_pendente(&banco), b"banco vindo da nuvem").unwrap();

        assert!(trocar_se_pendente(&banco));
        assert_eq!(std::fs::read(&banco).unwrap(), b"banco vindo da nuvem");
        assert!(!caminho_anterior(&banco).exists());
    }

    #[test]
    fn pendente_e_anterior_nao_colidem_com_o_banco() {
        // Se qualquer um dos tres caminhos coincidir, a troca apaga o que
        // deveria preservar.
        let banco = PathBuf::from("/tmp/controle-de-gastos.db");
        let p = caminho_pendente(&banco);
        let a = caminho_anterior(&banco);

        assert_ne!(p, banco);
        assert_ne!(a, banco);
        assert_ne!(p, a);
    }

    #[test]
    fn o_envelope_do_push_e_o_que_o_pull_abre() {
        // Fecha o ciclo sem rede: o que `cloud_backup_push` cifraria e
        // exatamente o que `cloud_backup_pull` decifra do outro lado.
        let dek = generate_dek();
        let banco = b"SQLite format 3\0lancamentos do usuario";

        let envelope = crate::crypto::seal_envelope(banco, &dek);
        assert_ne!(&envelope[..], &banco[..], "o que sobe nao pode ser o banco em claro");

        let de_volta = crate::crypto::open_envelope(&envelope, &dek).unwrap();
        assert_eq!(de_volta, banco);
    }

    #[test]
    fn backup_de_outra_conta_nao_abre() {
        // Baixar o backup errado falha na tag AEAD, antes de tocar o disco.
        let envelope = crate::crypto::seal_envelope(b"dados da conta A", &generate_dek());
        assert!(crate::crypto::open_envelope(&envelope, &generate_dek()).is_err());
    }
}
