//! Atualizacao pelo proprio app (fase 21).
//!
//! O canal ja existia: o gateway serve um manifesto assinado com Ed25519 que
//! carrega versao, tamanho, sha256 e URL de cada artefato (fases 13 e 16). O que
//! faltava era o lado do aparelho, e e o que mora aqui.
//!
//! **Ordem inegociavel: assinatura, depois sha256, depois disco.** Sem isso a
//! atualizacao automatica vira o melhor vetor de ataque do produto -- um APK
//! trocado no caminho se instalaria sozinho. Quem entrega o arquivo (gateway,
//! CDN, rede do usuario) e apenas transporte: nada disso precisa ser confiavel
//! para o resultado ser seguro.
//!
//! O que este modulo **nao** faz: instalar. No Android nao existe instalacao
//! silenciosa fora de app de sistema ou device owner; quem confirma e sempre o
//! usuario, num dialogo do sistema. O disparo desse dialogo esta em
//! `instalador.rs`.

use std::io::Write;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use ed25519_dalek::{Signature, VerifyingKey};

/// Chave publica que assina as releases, em hexa (32 bytes).
///
/// E a mesma do `deploy.toml` (`public_key`), e a privada nunca sai da maquina
/// que publica. Trocar o par aqui e la ao mesmo tempo e uma rotacao; trocar so
/// aqui faz o app recusar toda release existente, que e o comportamento certo
/// para uma chave que nao deveria estar assinando.
pub const CHAVE_PUBLICA_RELEASE: &str =
    "104c81a81b05108f914c50d091cd184a210eae57528e20298d8835344b740045";

const APP: &str = "contr0l";
const CANAL: &str = "stable";

/// Base do gateway. Mesma do `deploy.toml`, e a mesma que a landing consome.
const BASE_PADRAO: &str = "https://updates-gateway.sofaltaumaletr.workers.dev";

/// Uma checagem por dia. Nao e economia de banda: e a diferenca entre "o app
/// consulta um servidor quando eu abro" e "o app consulta um servidor toda vez
/// que eu abro", e a segunda frase e a que o usuario nao autorizou.
pub const INTERVALO_CHECAGEM_SEGUNDOS: u64 = 24 * 60 * 60;

/// Teto de sanidade para o download. O APK tem ~88 MB; 300 MB e folga larga e
/// ainda assim impede que um manifesto adulterado -- ou um erro do publicador --
/// encha o disco do aparelho antes de qualquer verificacao acontecer.
pub const TAMANHO_MAXIMO_BYTES: u64 = 300 * 1024 * 1024;

fn base_url() -> String {
    option_env!("CONTR0L_CLOUD_URL").unwrap_or(BASE_PADRAO).trim_end_matches('/').to_string()
}

/* ------------------------------------------------------------- manifesto */

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct Artefato {
    pub platform: String,
    pub arch: String,
    pub kind: String,
    pub filename: String,
    pub size: u64,
    pub sha256: String,
    pub url: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct Manifesto {
    pub app: String,
    pub channel: String,
    pub version: String,
    #[serde(default)]
    pub mandatory: bool,
    #[serde(default)]
    pub min_version: Option<String>,
    #[serde(default)]
    pub notes: String,
    pub artifacts: Vec<Artefato>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct ErroUpdate {
    pub codigo: String,
    pub mensagem: String,
}

impl ErroUpdate {
    fn novo(codigo: &str, mensagem: &str) -> Self {
        Self { codigo: codigo.into(), mensagem: mensagem.into() }
    }
}

/// Serializacao canonica do manifesto: chaves ordenadas, sem espaco, UTF-8 cru.
///
/// Precisa bater **byte a byte** com o `json.dumps(..., sort_keys=True,
/// separators=(",",":"), ensure_ascii=False)` do `deploybase/manifest.py`, que e
/// o que foi assinado. Por isso ela e escrita a mao em vez de sair do
/// `serde_json::to_string`: a ordenacao daquele depende do feature
/// `preserve_order`, que qualquer dependencia futura pode ligar sem avisar, e o
/// sintoma seria toda release virar "assinatura invalida".
fn canonico(valor: &serde_json::Value, saida: &mut String) {
    use serde_json::Value;
    match valor {
        Value::Object(mapa) => {
            let mut chaves: Vec<&String> = mapa.keys().collect();
            chaves.sort();
            saida.push('{');
            for (i, chave) in chaves.iter().enumerate() {
                if i > 0 {
                    saida.push(',');
                }
                saida.push_str(&serde_json::to_string(chave).unwrap_or_default());
                saida.push(':');
                canonico(&mapa[*chave], saida);
            }
            saida.push('}');
        }
        Value::Array(itens) => {
            saida.push('[');
            for (i, item) in itens.iter().enumerate() {
                if i > 0 {
                    saida.push(',');
                }
                canonico(item, saida);
            }
            saida.push(']');
        }
        outro => saida.push_str(&serde_json::to_string(outro).unwrap_or_default()),
    }
}

fn chave_publica(hex: &str) -> Option<VerifyingKey> {
    if hex.len() != 64 {
        return None;
    }
    let mut bytes = [0u8; 32];
    for (i, par) in hex.as_bytes().chunks(2).enumerate() {
        bytes[i] = u8::from_str_radix(std::str::from_utf8(par).ok()?, 16).ok()?;
    }
    VerifyingKey::from_bytes(&bytes).ok()
}

/// Identificador curto da chave, igual ao `key_id()` do `deploybase/signing.py`.
fn key_id(chave_hex: &str) -> Option<String> {
    let mut bytes = [0u8; 32];
    if chave_hex.len() != 64 {
        return None;
    }
    for (i, par) in chave_hex.as_bytes().chunks(2).enumerate() {
        bytes[i] = u8::from_str_radix(std::str::from_utf8(par).ok()?, 16).ok()?;
    }
    Some(hex_de(&Sha256::digest(bytes))[..16].to_string())
}

fn hex_de(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Abre o envelope do gateway e devolve o manifesto **so se a assinatura bater**.
///
/// O `key_id` e conferido antes da assinatura de proposito: sem ele, uma release
/// assinada por outra chave falharia com "assinatura invalida", que manda
/// investigar o arquivo em vez da chave.
pub fn manifesto_verificado(corpo: &str, chave_hex: &str) -> Result<Manifesto, ErroUpdate> {
    let envelope: serde_json::Value = serde_json::from_str(corpo)
        .map_err(|_| ErroUpdate::novo("manifesto_invalido", "O manifesto de atualizacao veio malformado."))?;

    let manifesto = envelope
        .get("manifest")
        .ok_or_else(|| ErroUpdate::novo("manifesto_invalido", "O manifesto de atualizacao veio malformado."))?;
    let assinatura = envelope.get("signature").unwrap_or(&serde_json::Value::Null);

    if assinatura.get("alg").and_then(|v| v.as_str()) != Some("ed25519") {
        return Err(ErroUpdate::novo("assinatura_invalida", "A atualizacao nao esta assinada como esperado."));
    }
    let esperado = key_id(chave_hex)
        .ok_or_else(|| ErroUpdate::novo("chave_invalida", "A chave de verificacao embutida e invalida."))?;
    if assinatura.get("key_id").and_then(|v| v.as_str()) != Some(esperado.as_str()) {
        return Err(ErroUpdate::novo("assinatura_invalida", "A atualizacao foi assinada por outra chave."));
    }

    let sig_b64 = assinatura
        .get("sig")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ErroUpdate::novo("assinatura_invalida", "A atualizacao veio sem assinatura."))?;
    use base64::Engine;
    let sig = base64::engine::general_purpose::STANDARD
        .decode(sig_b64)
        .map_err(|_| ErroUpdate::novo("assinatura_invalida", "A assinatura da atualizacao e ilegivel."))?;
    let sig = Signature::from_slice(&sig)
        .map_err(|_| ErroUpdate::novo("assinatura_invalida", "A assinatura da atualizacao e ilegivel."))?;

    let chave = chave_publica(chave_hex)
        .ok_or_else(|| ErroUpdate::novo("chave_invalida", "A chave de verificacao embutida e invalida."))?;
    let mut texto = String::new();
    canonico(manifesto, &mut texto);
    chave
        .verify_strict(texto.as_bytes(), &sig)
        .map_err(|_| ErroUpdate::novo("assinatura_invalida", "A atualizacao nao passou na verificacao de assinatura."))?;

    let manifesto: Manifesto = serde_json::from_value(manifesto.clone())
        .map_err(|_| ErroUpdate::novo("manifesto_invalido", "O manifesto de atualizacao veio malformado."))?;

    // Assinatura valida de outro app ou de outro canal continua sendo assinatura
    // valida. Sem esta checagem, publicar outro app no mesmo repo instalaria ele
    // aqui.
    if manifesto.app != APP || manifesto.channel != CANAL {
        return Err(ErroUpdate::novo("manifesto_invalido", "Este manifesto nao e deste aplicativo."));
    }
    Ok(manifesto)
}

/* -------------------------------------------------------------- versoes */

/// Ordena semver simples. Espelha `parse_version()` do `deploybase/manifest.py`,
/// inclusive a regra de pre-release vir **antes** do lancamento final.
fn ordem(versao: &str) -> Option<(u64, u64, u64, u8, Vec<String>)> {
    let (nucleo, pre) = match versao.split_once('-') {
        Some((n, p)) => (n, Some(p)),
        None => (versao, None),
    };
    let mut partes = nucleo.split('.');
    let x = partes.next()?.parse().ok()?;
    let y = partes.next()?.parse().ok()?;
    let z = partes.next()?.parse().ok()?;
    if partes.next().is_some() {
        return None;
    }
    match pre {
        None => Some((x, y, z, 1, vec![])),
        Some(p) if p.is_empty() => None,
        Some(p) => Some((x, y, z, 0, p.split('.').map(|s| s.to_string()).collect())),
    }
}

/// A candidata e mais nova que a instalada?
///
/// Versao ilegivel responde `false`: na duvida, nao atualizar. Oferecer uma
/// atualizacao que na verdade e um retrocesso e pior que nao oferecer nada.
pub fn mais_nova(candidata: &str, atual: &str) -> bool {
    match (ordem(candidata), ordem(atual)) {
        (Some(c), Some(a)) => c > a,
        _ => false,
    }
}

/* ---------------------------------------------------------------- estado */

/// O que a UI recebe da checagem.
#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum EstadoAtualizacao {
    Disponivel {
        versao: String,
        notas: String,
        bytes: u64,
        obrigatoria: bool,
        /// Nome do arquivo que sera baixado -- some na tela, serve para suporte.
        arquivo: String,
    },
    EmDia {
        versao: String,
    },
    /// Ainda dentro da janela da ultima checagem.
    Cedo {
        faltam_segundos: u64,
    },
    /// Esta versao foi dispensada pelo usuario.
    Dispensada {
        versao: String,
    },
    /// Nao deu para saber. **Nao e erro para o usuario:** o app funciona
    /// offline por definicao, e uma checagem que falha nao pode virar tela de
    /// erro nem impedir o uso.
    Indisponivel {
        motivo: String,
    },
}

/// Plataforma e tipo de artefato que este binario sabe instalar.
///
/// Fora de Android e Windows nao ha caminho de instalacao, e a checagem devolve
/// `Indisponivel` em vez de oferecer um arquivo que nao serve.
pub fn artefato_desta_plataforma(m: &Manifesto) -> Option<&Artefato> {
    let (plataforma, tipo) = if cfg!(target_os = "android") {
        ("android", "apk")
    } else if cfg!(target_os = "windows") {
        ("windows", "exe")
    } else {
        return None;
    };
    m.artifacts.iter().find(|a| a.platform == plataforma && a.kind == tipo)
}

/// Estado guardado entre execucoes: quando foi a ultima checagem e qual versao
/// o usuario mandou parar de oferecer.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct EstadoLocal {
    #[serde(default)]
    pub ultima_checagem: u64,
    #[serde(default)]
    pub versao_dispensada: Option<String>,
}

fn caminho_estado(app: &tauri::AppHandle) -> Result<std::path::PathBuf, ErroUpdate> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|_| ErroUpdate::novo("sem_pasta", "Nao foi possivel acessar a pasta do app."))?;
    let _ = std::fs::create_dir_all(&dir);
    Ok(dir.join("atualizacao.json"))
}

fn ler_estado(app: &tauri::AppHandle) -> EstadoLocal {
    caminho_estado(app)
        .ok()
        .and_then(|c| std::fs::read_to_string(c).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn gravar_estado(app: &tauri::AppHandle, estado: &EstadoLocal) {
    // Falhar aqui custa uma checagem a mais no proximo boot, e nada alem disso.
    if let Ok(caminho) = caminho_estado(app) {
        if let Ok(texto) = serde_json::to_string(estado) {
            let _ = std::fs::write(caminho, texto);
        }
    }
}

fn agora() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Decide se a checagem deve sair agora. Separada do comando para ser testavel
/// sem relogio real nem rede.
pub fn deve_checar(estado: &EstadoLocal, agora: u64, forcar: bool) -> Result<(), u64> {
    if forcar || estado.ultima_checagem == 0 {
        return Ok(());
    }
    let decorrido = agora.saturating_sub(estado.ultima_checagem);
    if decorrido >= INTERVALO_CHECAGEM_SEGUNDOS {
        Ok(())
    } else {
        Err(INTERVALO_CHECAGEM_SEGUNDOS - decorrido)
    }
}

/// A dispensa ainda vale nesta checagem?
///
/// Uma checagem pedida a mao revoga o "agora nao" anterior: quem aperta
/// "verificar atualizacao" esta dizendo que quer saber agora, e responder "voce
/// ja dispensou essa versao" seria obedecer a uma ordem que a propria pessoa
/// acabou de cancelar -- com o agravante de o app nao ter como explicar isso.
pub fn dispensa_em_vigor<'a>(forcar: bool, dispensada: Option<&'a str>) -> Option<&'a str> {
    if forcar {
        None
    } else {
        dispensada
    }
}

/// Compara o manifesto verificado com o que esta instalado e diz o que fazer.
///
/// Recebe tudo por parametro -- inclusive a versao instalada e a versao
/// dispensada -- porque e aqui que mora a regra, e regra sem teste vira
/// suposicao.
pub fn decidir(
    manifesto: &Manifesto,
    versao_instalada: &str,
    versao_dispensada: Option<&str>,
) -> EstadoAtualizacao {
    if !mais_nova(&manifesto.version, versao_instalada) {
        return EstadoAtualizacao::EmDia { versao: versao_instalada.to_string() };
    }
    let Some(artefato) = artefato_desta_plataforma(manifesto) else {
        return EstadoAtualizacao::Indisponivel {
            motivo: "Nao ha download desta versao para este aparelho.".into(),
        };
    };
    if artefato.size > TAMANHO_MAXIMO_BYTES {
        return EstadoAtualizacao::Indisponivel {
            motivo: "O arquivo da atualizacao e maior do que o app aceita baixar.".into(),
        };
    }
    // Dispensa nao vale para atualizacao obrigatoria, e nao vale para a versao
    // seguinte: dispensar a 0.5.0 nao pode esconder a 0.6.0 para sempre.
    if !manifesto.mandatory && versao_dispensada == Some(manifesto.version.as_str()) {
        return EstadoAtualizacao::Dispensada { versao: manifesto.version.clone() };
    }
    EstadoAtualizacao::Disponivel {
        versao: manifesto.version.clone(),
        notas: manifesto.notes.clone(),
        bytes: artefato.size,
        obrigatoria: manifesto.mandatory,
        arquivo: artefato.filename.clone(),
    }
}

/* -------------------------------------------------------------- comandos */

/// Consulta o manifesto assinado, no maximo uma vez por dia.
///
/// **Nunca falha para o usuario.** Sem rede, com servidor fora ou com assinatura
/// ruim, o resultado e `Indisponivel` -- um app que funciona offline nao pode
/// abrir com tela de erro porque nao conseguiu perguntar se ha versao nova.
#[tauri::command]
pub async fn atualizacao_verificar(
    app: tauri::AppHandle,
    forcar: bool,
) -> Result<EstadoAtualizacao, ErroUpdate> {
    let mut estado = ler_estado(&app);
    if let Err(faltam) = deve_checar(&estado, agora(), forcar) {
        return Ok(EstadoAtualizacao::Cedo { faltam_segundos: faltam });
    }

    let url = format!("{}/v1/apps/{APP}/latest?channel={CANAL}", base_url());
    let resposta = match reqwest::Client::new().get(url).send().await {
        Ok(r) => r,
        Err(_) => {
            return Ok(EstadoAtualizacao::Indisponivel {
                motivo: "Sem conexao para verificar atualizacoes.".into(),
            })
        }
    };
    if !resposta.status().is_success() {
        return Ok(EstadoAtualizacao::Indisponivel {
            motivo: "O servidor de atualizacoes nao respondeu.".into(),
        });
    }
    let corpo = match resposta.text().await {
        Ok(t) => t,
        Err(_) => {
            return Ok(EstadoAtualizacao::Indisponivel {
                motivo: "Sem conexao para verificar atualizacoes.".into(),
            })
        }
    };

    let manifesto = match manifesto_verificado(&corpo, CHAVE_PUBLICA_RELEASE) {
        Ok(m) => m,
        Err(e) => return Ok(EstadoAtualizacao::Indisponivel { motivo: e.mensagem }),
    };

    // So carimba depois de uma checagem que de fato chegou ao fim: falha de rede
    // nao pode consumir a janela do dia.
    estado.ultima_checagem = agora();
    gravar_estado(&app, &estado);

    let instalada = app.package_info().version.to_string();
    let dispensada = dispensa_em_vigor(forcar, estado.versao_dispensada.as_deref());
    Ok(decidir(&manifesto, &instalada, dispensada))
}

/// Para de oferecer esta versao. A proxima volta a aparecer.
#[tauri::command]
pub fn atualizacao_dispensar(app: tauri::AppHandle, versao: String) {
    let mut estado = ler_estado(&app);
    estado.versao_dispensada = Some(versao);
    gravar_estado(&app, &estado);
}

/// Resultado do download.
#[derive(Debug, Serialize)]
pub struct ArquivoBaixado {
    pub caminho: String,
    pub bytes: u64,
    pub versao: String,
}

/// Baixa o artefato desta plataforma e **so devolve o caminho se o sha256 do
/// manifesto assinado bater**.
///
/// O arquivo e escrito com sufixo `.parcial` e so ganha o nome final depois da
/// conferencia. Um download interrompido no meio nunca se parece com um arquivo
/// pronto para instalar -- e o instalador so recebe caminho que passou por aqui.
#[tauri::command]
pub async fn atualizacao_baixar(app: tauri::AppHandle) -> Result<ArquivoBaixado, ErroUpdate> {
    use tauri::Emitter;
    use tauri::Manager;

    let url = format!("{}/v1/apps/{APP}/latest?channel={CANAL}", base_url());
    let corpo = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|_| ErroUpdate::novo("sem_conexao", "Sem conexao para baixar a atualizacao."))?
        .text()
        .await
        .map_err(|_| ErroUpdate::novo("sem_conexao", "Sem conexao para baixar a atualizacao."))?;

    // O manifesto e verificado de novo, e nao reaproveitado da checagem: entre
    // uma coisa e outra o app pode ter ficado horas aberto, e e a assinatura que
    // autoriza baixar esta URL com este hash.
    let manifesto = manifesto_verificado(&corpo, CHAVE_PUBLICA_RELEASE)?;
    let artefato = artefato_desta_plataforma(&manifesto)
        .ok_or_else(|| ErroUpdate::novo("sem_artefato", "Nao ha download desta versao para este aparelho."))?
        .clone();
    if artefato.size > TAMANHO_MAXIMO_BYTES {
        return Err(ErroUpdate::novo("arquivo_grande", "O arquivo da atualizacao e maior do que o app aceita baixar."));
    }

    let pasta = app
        .path()
        .app_cache_dir()
        .map_err(|_| ErroUpdate::novo("sem_pasta", "Nao foi possivel acessar a pasta do app."))?
        .join("atualizacoes");
    std::fs::create_dir_all(&pasta)
        .map_err(|_| ErroUpdate::novo("sem_pasta", "Nao foi possivel criar a pasta de download."))?;
    let destino = pasta.join(&artefato.filename);
    let parcial = destino.with_extension("parcial");

    let baixados = baixar_verificado(&artefato, &parcial, &destino, |baixados, total| {
        let _ = app.emit("atualizacao://progresso", (baixados, total));
    })
    .await?;

    Ok(ArquivoBaixado {
        caminho: destino.to_string_lossy().to_string(),
        bytes: baixados,
        versao: manifesto.version,
    })
}


/// Baixa, confere e so entao promove o arquivo ao nome final.
///
/// Fica separada do comando por dois motivos: e ela que da para testar contra o
/// gateway de verdade sem Tauri no meio (ver `baixa_o_exe_real_e_confere_o_hash`),
/// e o progresso entra por callback em vez de evento -- quem chama decide se
/// isso vira `emit` para a tela ou nada.
pub async fn baixar_verificado<F: FnMut(u64, u64) + Send>(
    artefato: &Artefato,
    parcial: &std::path::Path,
    destino: &std::path::Path,
    mut progresso: F,
) -> Result<u64, ErroUpdate> {
    let mut resposta = reqwest::Client::new()
        .get(&artefato.url)
        .send()
        .await
        .map_err(|_| ErroUpdate::novo("sem_conexao", "Sem conexao para baixar a atualizacao."))?;
    if !resposta.status().is_success() {
        return Err(ErroUpdate::novo("download_falhou", "O servidor recusou o download da atualizacao."));
    }

    let mut arquivo = std::fs::File::create(parcial)
        .map_err(|_| ErroUpdate::novo("falha_ao_gravar", "Nao foi possivel gravar o arquivo baixado."))?;
    let mut hash = Sha256::new();
    let mut baixados: u64 = 0;
    let mut ultimo_aviso = 0u64;

    while let Some(pedaco) = resposta
        .chunk()
        .await
        .map_err(|_| ErroUpdate::novo("sem_conexao", "A conexao caiu no meio do download."))?
    {
        baixados += pedaco.len() as u64;
        if baixados > TAMANHO_MAXIMO_BYTES {
            let _ = std::fs::remove_file(parcial);
            return Err(ErroUpdate::novo("arquivo_grande", "O download passou do tamanho anunciado."));
        }
        hash.update(&pedaco);
        arquivo
            .write_all(&pedaco)
            .map_err(|_| ErroUpdate::novo("falha_ao_gravar", "Nao foi possivel gravar o arquivo baixado."))?;

        // Um aviso por MB: o suficiente para a barra andar e sem inundar a ponte
        // com uma mensagem por pedaco de rede.
        if baixados - ultimo_aviso >= 1024 * 1024 {
            ultimo_aviso = baixados;
            progresso(baixados, artefato.size);
        }
    }
    drop(arquivo);

    let calculado = hex_de(&hash.finalize());
    if !calculado.eq_ignore_ascii_case(&artefato.sha256) {
        // Arquivo que nao confere nao fica no disco. Guardar "para analisar
        // depois" e como se acaba instalando o que nao devia.
        let _ = std::fs::remove_file(parcial);
        return Err(ErroUpdate::novo(
            "hash_divergente",
            "O arquivo baixado nao confere com a assinatura da versao. Nada foi instalado.",
        ));
    }

    std::fs::rename(parcial, destino)
        .map_err(|_| ErroUpdate::novo("falha_ao_gravar", "Nao foi possivel concluir o arquivo baixado."))?;
    progresso(baixados, artefato.size);
    Ok(baixados)
}

/* ----------------------------------------------------------------- teste */

#[cfg(test)]
mod tests {
    use super::*;

    /// Envelope real servido pelo gateway em 2026-09-01, com a assinatura de
    /// verdade. E o unico teste que prova que a canonicalizacao daqui bate com a
    /// do publicador em Python -- reescrever `canonico()` e ver isto passar e a
    /// diferenca entre "acho que bate" e "bate".
    const ENVELOPE_REAL: &str = include_str!("../fixtures/manifesto-contr0l-0.5.0.json");

    #[test]
    fn o_manifesto_real_do_gateway_passa_na_assinatura() {
        let m = manifesto_verificado(ENVELOPE_REAL, CHAVE_PUBLICA_RELEASE).expect("assinatura valida");
        assert_eq!(m.version, "0.5.0");
        assert_eq!(m.app, "contr0l");
        assert_eq!(m.artifacts.len(), 2);
        let apk = m.artifacts.iter().find(|a| a.kind == "apk").unwrap();
        assert_eq!(apk.size, 87_920_201);
        assert_eq!(apk.sha256, "8e513581b60a1f018b33de4b9412c8eb8496e22394f1e9b1734a73c90325547e");
    }

    #[test]
    fn um_byte_trocado_no_manifesto_derruba_a_assinatura() {
        // A URL de download entra na assinatura. Trocar o destino do arquivo e
        // exatamente o ataque que isto precisa impedir.
        let adulterado = ENVELOPE_REAL.replace(
            "updates-gateway.sofaltaumaletr.workers.dev/v1/apps/contr0l/download",
            "servidor-do-atacante.exemplo/v1/apps/contr0l/download",
        );
        assert_ne!(adulterado, ENVELOPE_REAL);
        let erro = manifesto_verificado(&adulterado, CHAVE_PUBLICA_RELEASE).unwrap_err();
        assert_eq!(erro.codigo, "assinatura_invalida");
    }

    #[test]
    fn manifesto_assinado_por_outra_chave_e_recusado_pelo_key_id() {
        let outra = "0000000000000000000000000000000000000000000000000000000000000000";
        let erro = manifesto_verificado(ENVELOPE_REAL, outra).unwrap_err();
        // Chave toda zero nao e um ponto valido da curva; o app recusa antes de
        // tentar verificar qualquer coisa com ela.
        assert!(matches!(erro.codigo.as_str(), "chave_invalida" | "assinatura_invalida"));
    }

    #[test]
    fn canonico_ordena_chaves_e_nao_poe_espaco() {
        let v: serde_json::Value = serde_json::json!({"b": 1, "a": [1, {"d": null, "c": "x"}]});
        let mut s = String::new();
        canonico(&v, &mut s);
        assert_eq!(s, r#"{"a":[1,{"c":"x","d":null}],"b":1}"#);
    }

    #[test]
    fn canonico_mantem_acento_cru_como_o_publicador_faz() {
        // `ensure_ascii=False` no Python. Escapar aqui mudaria os bytes
        // assinados e quebraria toda release com acento nas notas -- ou seja,
        // todas.
        let v: serde_json::Value = serde_json::json!({"notes": "atualização"});
        let mut s = String::new();
        canonico(&v, &mut s);
        assert_eq!(s, "{\"notes\":\"atualização\"}");
    }

    #[test]
    fn versao_mais_nova_segue_a_regra_do_publicador() {
        assert!(mais_nova("0.5.1", "0.5.0"));
        assert!(mais_nova("0.6.0", "0.5.9"));
        assert!(mais_nova("1.0.0", "0.99.99"));
        assert!(!mais_nova("0.5.0", "0.5.0"));
        assert!(!mais_nova("0.4.9", "0.5.0"));
        // Pre-release vem antes do lancamento final, como em manifest.py.
        assert!(mais_nova("0.5.0", "0.5.0-rc.1"));
        assert!(!mais_nova("0.5.0-rc.1", "0.5.0"));
        // Versao ilegivel nunca vira oferta de atualizacao.
        assert!(!mais_nova("nao-e-versao", "0.5.0"));
        assert!(!mais_nova("0.6.0", "sei-la"));
        assert!(!mais_nova("0.5", "0.4.0"));
    }

    /// Regressao de produto: a pessoa dispensa a versao, alguem publica um
    /// conserto, ela aperta "verificar" -- e o app respondia "dispensada",
    /// escondendo justamente a versao que ela foi buscar.
    #[test]
    fn checagem_pedida_a_mao_revoga_a_dispensa() {
        assert_eq!(dispensa_em_vigor(false, Some("0.5.2")), Some("0.5.2"));
        assert_eq!(dispensa_em_vigor(true, Some("0.5.2")), None);
    }

    #[test]
    fn a_janela_de_um_dia_e_respeitada_e_forcar_a_ignora() {
        let estado = EstadoLocal { ultima_checagem: 1000, versao_dispensada: None };
        assert_eq!(deve_checar(&estado, 1000 + 60, false), Err(INTERVALO_CHECAGEM_SEGUNDOS - 60));
        assert_eq!(deve_checar(&estado, 1000 + INTERVALO_CHECAGEM_SEGUNDOS, false), Ok(()));
        // Quem toca "verificar agora" nao pode ouvir "volte amanha".
        assert_eq!(deve_checar(&estado, 1000 + 60, true), Ok(()));
        // Primeira execucao checa na hora.
        assert_eq!(deve_checar(&EstadoLocal::default(), 5, false), Ok(()));
    }

    fn manifesto(versao: &str, obrigatoria: bool) -> Manifesto {
        Manifesto {
            app: APP.into(),
            channel: CANAL.into(),
            version: versao.into(),
            mandatory: obrigatoria,
            min_version: None,
            notes: "notas".into(),
            artifacts: vec![
                Artefato {
                    platform: "android".into(),
                    arch: "universal".into(),
                    kind: "apk".into(),
                    filename: format!("contr0l-{versao}.apk"),
                    size: 88_000_000,
                    sha256: "aa".into(),
                    url: "https://exemplo/apk".into(),
                },
                Artefato {
                    platform: "windows".into(),
                    arch: "x64".into(),
                    kind: "exe".into(),
                    filename: format!("contr0l-{versao}.exe"),
                    size: 9_000_000,
                    sha256: "bb".into(),
                    url: "https://exemplo/exe".into(),
                },
            ],
        }
    }

    #[test]
    fn versao_igual_ou_menor_nao_vira_oferta() {
        assert_eq!(
            decidir(&manifesto("0.5.0", false), "0.5.0", None),
            EstadoAtualizacao::EmDia { versao: "0.5.0".into() }
        );
        assert_eq!(
            decidir(&manifesto("0.4.0", false), "0.5.0", None),
            EstadoAtualizacao::EmDia { versao: "0.5.0".into() }
        );
    }

    #[test]
    fn versao_dispensada_some_mas_a_seguinte_volta() {
        assert_eq!(
            decidir(&manifesto("0.6.0", false), "0.5.0", Some("0.6.0")),
            EstadoAtualizacao::Dispensada { versao: "0.6.0".into() }
        );
        assert!(matches!(
            decidir(&manifesto("0.7.0", false), "0.5.0", Some("0.6.0")),
            EstadoAtualizacao::Disponivel { .. }
        ));
    }

    #[test]
    fn atualizacao_obrigatoria_ignora_a_dispensa() {
        assert!(matches!(
            decidir(&manifesto("0.6.0", true), "0.5.0", Some("0.6.0")),
            EstadoAtualizacao::Disponivel { obrigatoria: true, .. }
        ));
    }

    #[test]
    fn a_oferta_carrega_o_tamanho_para_a_tela_poder_avisar() {
        // 88 MB no dado movel de alguem sem perguntar e abuso; a tela precisa do
        // numero para conseguir perguntar.
        match decidir(&manifesto("0.6.0", false), "0.5.0", None) {
            EstadoAtualizacao::Disponivel { bytes, versao, .. } => {
                assert_eq!(versao, "0.6.0");
                assert!(bytes > 1_000_000);
            }
            outro => panic!("esperava oferta, veio {outro:?}"),
        }
    }

    /// Pre-voo do fluxo inteiro contra o gateway de producao: busca o manifesto,
    /// confere a assinatura, baixa o artefato do Windows de verdade e so aceita
    /// se o sha256 bater.
    ///
    /// Fica `#[ignore]` porque depende de rede e baixa ~9 MB -- nao pode entrar
    /// na suite que roda a cada mudanca. Rodar antes de publicar:
    ///
    ///   cargo test --offline -- --ignored --nocapture pre_voo
    #[test]
    #[ignore = "usa rede e baixa o instalador real"]
    fn pre_voo_baixa_o_artefato_real_e_confere_o_hash() {
        tauri::async_runtime::block_on(async {
            let corpo = reqwest::get(format!("{}/v1/apps/{APP}/latest?channel={CANAL}", base_url()))
                .await
                .expect("gateway respondeu")
                .text()
                .await
                .expect("corpo do manifesto");

            let manifesto = manifesto_verificado(&corpo, CHAVE_PUBLICA_RELEASE)
                .expect("assinatura do manifesto em producao");
            println!("manifesto assinado: versao {}", manifesto.version);

            let artefato = artefato_desta_plataforma(&manifesto).expect("artefato desta plataforma").clone();
            println!("artefato: {} ({} bytes)", artefato.filename, artefato.size);

            let pasta = std::env::temp_dir().join("contr0l-pre-voo");
            let _ = std::fs::create_dir_all(&pasta);
            let destino = pasta.join(&artefato.filename);
            let parcial = destino.with_extension("parcial");
            let _ = std::fs::remove_file(&destino);

            let baixados = baixar_verificado(&artefato, &parcial, &destino, |feito, total| {
                println!("  {feito} de {total}");
            })
            .await
            .expect("download conferido");

            assert_eq!(baixados, artefato.size, "tamanho baixado bate com o manifesto");
            assert!(destino.exists(), "arquivo promovido ao nome final");
            assert!(!parcial.exists(), "o .parcial nao sobrevive ao sucesso");
            println!("OK -- {} verificado em {}", artefato.filename, destino.display());
        });
    }

    /// Hash trocado tem de derrubar o download, apagar o arquivo e nao deixar
    /// nada instalavel para tras.
    #[test]
    #[ignore = "usa rede e baixa o instalador real"]
    fn pre_voo_hash_errado_apaga_o_arquivo() {
        tauri::async_runtime::block_on(async {
            let corpo = reqwest::get(format!("{}/v1/apps/{APP}/latest?channel={CANAL}", base_url()))
                .await
                .expect("gateway respondeu")
                .text()
                .await
                .expect("corpo do manifesto");
            let manifesto = manifesto_verificado(&corpo, CHAVE_PUBLICA_RELEASE).expect("assinatura");
            let mut artefato = artefato_desta_plataforma(&manifesto).expect("artefato").clone();
            artefato.sha256 = "0".repeat(64);

            let pasta = std::env::temp_dir().join("contr0l-pre-voo");
            let _ = std::fs::create_dir_all(&pasta);
            let destino = pasta.join("nao-deve-existir.bin");
            let parcial = destino.with_extension("parcial");

            let erro = baixar_verificado(&artefato, &parcial, &destino, |_, _| {})
                .await
                .expect_err("hash divergente tem de falhar");
            assert_eq!(erro.codigo, "hash_divergente");
            assert!(!destino.exists(), "nada foi promovido");
            assert!(!parcial.exists(), "o parcial foi apagado");
            println!("OK -- hash divergente recusado e arquivo apagado");
        });
    }
}
