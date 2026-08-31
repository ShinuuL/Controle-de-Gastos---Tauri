//! Criptografia ponta a ponta do backup na nuvem (fase 11/17).
//!
//! Desenho: `docs/superpowers/specs/2026-08-29-nuvem-sync-design.md`.
//!
//! Duas derivacoes independentes saem da mesma senha, com salts distintos:
//!
//! ```text
//! senha --Argon2id(salt_auth)--> verificador --> servidor (so login)
//!       \-Argon2id(salt_kek )--> KEK (fica no aparelho) --> desembrulha a DEK
//!                                                              |
//! DEK aleatoria de 256 bits, gerada no aparelho ----------------+--> cifra o .db
//! ```
//!
//! Quem tem o verificador nao chega na KEK, porque o salt e outro. O servidor
//! guarda a DEK **embrulhada** pela KEK, entao trocar a senha e re-embrulhar a
//! DEK -- nao re-cifrar o banco inteiro.
//!
//! Este modulo nao faz rede e nao le arquivo: recebe e devolve bytes. Isso
//! mantem os testes deterministas e deixa a I/O na camada dos comandos.

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::{Aead, KeyInit, OsRng};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use rand::RngCore;
use zeroize::Zeroizing;

/// Marca do envelope. Recusa arquivo estranho antes de gastar Argon2 e antes de
/// tentar decifrar -- sem isto, um arquivo trocado so falharia na tag AEAD, com
/// mensagem que nao ajuda ninguem.
pub const ENVELOPE_MAGIC: [u8; 4] = *b"C0G1";

/// Versao do formato do envelope. Existe para trocar primitiva depois sem
/// precisar adivinhar como o arquivo antigo foi cifrado.
pub const ENVELOPE_VERSION: u8 = 1;

const NONCE_LEN: usize = 24;
const KEY_LEN: usize = 32;
const SALT_LEN: usize = 16;
const HEADER_LEN: usize = 4 + 1 + NONCE_LEN + 8;

pub type Key = Zeroizing<[u8; KEY_LEN]>;

#[derive(Debug, PartialEq, Eq)]
pub enum CryptoError {
    /// Parametros de KDF fora do que a crate aceita.
    ParametrosInvalidos(String),
    /// Salt curto demais para o Argon2 (minimo de 8 bytes).
    SaltCurto,
    /// O arquivo nao comeca com `C0G1`.
    MagicInvalido,
    /// Versao de envelope que este binario nao sabe abrir.
    VersaoNaoSuportada(u8),
    /// Arquivo menor que o proprio cabecalho.
    EnvelopeTruncado,
    /// Senha errada, chave errada ou arquivo adulterado -- a tag AEAD nao fecha.
    /// Os tres casos sao indistinguiveis de proposito.
    FalhaAoDecifrar,
    /// Decifrou, mas o tamanho nao bate com o declarado no cabecalho.
    TamanhoDivergente { esperado: u64, obtido: u64 },
}

impl std::fmt::Display for CryptoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ParametrosInvalidos(m) => write!(f, "parametros de derivacao invalidos: {m}"),
            Self::SaltCurto => write!(f, "salt precisa ter ao menos 8 bytes"),
            Self::MagicInvalido => write!(f, "arquivo nao e um backup deste app"),
            Self::VersaoNaoSuportada(v) => {
                write!(f, "backup na versao {v}, nao suportada por esta versao do app")
            }
            Self::EnvelopeTruncado => write!(f, "backup incompleto ou corrompido"),
            Self::FalhaAoDecifrar => write!(f, "senha incorreta ou backup adulterado"),
            Self::TamanhoDivergente { esperado, obtido } => {
                write!(f, "backup corrompido: esperado {esperado} bytes, obtido {obtido}")
            }
        }
    }
}

impl std::error::Error for CryptoError {}

/// Parametros do Argon2id, guardados junto da conta.
///
/// Vao para o servidor e voltam no login porque, sem eles, subir o custo depois
/// deixaria as contas antigas sem como derivar a mesma chave.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KdfParams {
    /// Memoria em KiB.
    pub m_cost: u32,
    /// Numero de passagens.
    pub t_cost: u32,
    /// Paralelismo.
    pub p_cost: u32,
}

impl Default for KdfParams {
    /// 64 MiB, 3 passagens, 1 thread -- o que a spec fixou.
    fn default() -> Self {
        Self { m_cost: 64 * 1024, t_cost: 3, p_cost: 1 }
    }
}

impl KdfParams {
    fn build(&self) -> Result<Argon2<'static>, CryptoError> {
        let params = Params::new(self.m_cost, self.t_cost, self.p_cost, Some(KEY_LEN))
            .map_err(|e| CryptoError::ParametrosInvalidos(e.to_string()))?;
        Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
    }
}

fn derive(password: &[u8], salt: &[u8], params: KdfParams) -> Result<Key, CryptoError> {
    if salt.len() < 8 {
        return Err(CryptoError::SaltCurto);
    }
    let mut out: Key = Zeroizing::new([0u8; KEY_LEN]);
    params
        .build()?
        .hash_password_into(password, salt, out.as_mut())
        .map_err(|e| CryptoError::ParametrosInvalidos(e.to_string()))?;
    Ok(out)
}

/// Verificador de login. **Este e o unico derivado que sai do aparelho.**
pub fn derive_verifier(
    password: &str,
    salt_auth: &[u8],
    params: KdfParams,
) -> Result<Key, CryptoError> {
    derive(password.as_bytes(), salt_auth, params)
}

/// KEK -- chave que embrulha a DEK. **Nunca sai do aparelho.**
pub fn derive_kek(password: &str, salt_kek: &[u8], params: KdfParams) -> Result<Key, CryptoError> {
    derive(password.as_bytes(), salt_kek, params)
}

/// Salt aleatorio de 16 bytes. Nao e segredo: o servidor guarda e devolve.
pub fn generate_salt() -> [u8; SALT_LEN] {
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    salt
}

/// DEK aleatoria de 256 bits. E ela que cifra o `.db`; a senha nunca cifra
/// dado diretamente, senao trocar a senha obrigaria a re-cifrar tudo.
pub fn generate_dek() -> Key {
    let mut dek: Key = Zeroizing::new([0u8; KEY_LEN]);
    OsRng.fill_bytes(dek.as_mut());
    dek
}

fn seal(key: &[u8; KEY_LEN], plaintext: &[u8]) -> (XNonce, Vec<u8>) {
    let cipher = XChaCha20Poly1305::new(key.into());
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = XNonce::from(nonce_bytes);
    // Só falha por overflow de tamanho, que não acontece com um .db em memória.
    let ciphertext = cipher.encrypt(&nonce, plaintext).expect("cifragem nao deve falhar");
    (nonce, ciphertext)
}

fn open(key: &[u8; KEY_LEN], nonce: &XNonce, ciphertext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    XChaCha20Poly1305::new(key.into())
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::FalhaAoDecifrar)
}

/// Embrulha a DEK com a KEK. O resultado (`nonce || ciphertext`) vai para o
/// servidor e e inutil sem a senha.
pub fn wrap_dek(dek: &Key, kek: &Key) -> Vec<u8> {
    let (nonce, ciphertext) = seal(kek, dek.as_ref());
    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(nonce.as_slice());
    out.extend_from_slice(&ciphertext);
    out
}

/// Desembrulha a DEK. Senha errada cai em `FalhaAoDecifrar`, nao em lixo.
pub fn unwrap_dek(wrapped: &[u8], kek: &Key) -> Result<Key, CryptoError> {
    if wrapped.len() <= NONCE_LEN {
        return Err(CryptoError::EnvelopeTruncado);
    }
    let nonce = XNonce::from_slice(&wrapped[..NONCE_LEN]);
    let plain = open(kek, nonce, &wrapped[NONCE_LEN..])?;
    if plain.len() != KEY_LEN {
        return Err(CryptoError::FalhaAoDecifrar);
    }
    let mut dek: Key = Zeroizing::new([0u8; KEY_LEN]);
    dek.copy_from_slice(&plain);
    Ok(dek)
}

/// Monta o envelope que sobe para o R2:
/// `magic(4) | versao(1) | nonce(24) | tamanho do plaintext(8, LE) | ciphertext+tag`.
pub fn seal_envelope(plaintext: &[u8], dek: &Key) -> Vec<u8> {
    let (nonce, ciphertext) = seal(dek, plaintext);
    let mut out = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    out.extend_from_slice(&ENVELOPE_MAGIC);
    out.push(ENVELOPE_VERSION);
    out.extend_from_slice(nonce.as_slice());
    out.extend_from_slice(&(plaintext.len() as u64).to_le_bytes());
    out.extend_from_slice(&ciphertext);
    out
}

/// Abre o envelope. Confere magic e versao **antes** de decifrar, e o tamanho
/// declarado depois -- um truncamento no meio do ciphertext ja falharia na tag,
/// mas a conferencia deixa o diagnostico explicito em vez de generico.
pub fn open_envelope(envelope: &[u8], dek: &Key) -> Result<Vec<u8>, CryptoError> {
    if envelope.len() < HEADER_LEN {
        return Err(CryptoError::EnvelopeTruncado);
    }
    if envelope[..4] != ENVELOPE_MAGIC {
        return Err(CryptoError::MagicInvalido);
    }
    let versao = envelope[4];
    if versao != ENVELOPE_VERSION {
        return Err(CryptoError::VersaoNaoSuportada(versao));
    }
    let nonce = XNonce::from_slice(&envelope[5..5 + NONCE_LEN]);
    let mut tamanho = [0u8; 8];
    tamanho.copy_from_slice(&envelope[5 + NONCE_LEN..HEADER_LEN]);
    let esperado = u64::from_le_bytes(tamanho);

    let plain = open(dek, nonce, &envelope[HEADER_LEN..])?;
    let obtido = plain.len() as u64;
    if obtido != esperado {
        return Err(CryptoError::TamanhoDivergente { esperado, obtido });
    }
    Ok(plain)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Argon2id com 64 MiB roda em ~100 ms e a suite chamaria isso dezenas de
    /// vezes. Os testes usam parametros baratos, e um teste separado cobre o
    /// padrao de producao para garantir que ele e aceito pela crate.
    fn params_de_teste() -> KdfParams {
        KdfParams { m_cost: 8, t_cost: 1, p_cost: 1 }
    }

    fn dek_fixa(byte: u8) -> Key {
        Zeroizing::new([byte; KEY_LEN])
    }

    #[test]
    fn envelope_faz_round_trip() {
        let dek = generate_dek();
        let db = b"SQLite format 3\0conteudo qualquer do banco";
        let envelope = seal_envelope(db, &dek);
        assert_eq!(open_envelope(&envelope, &dek).unwrap(), db);
    }

    #[test]
    fn envelope_do_banco_vazio_tambem_abre() {
        let dek = generate_dek();
        let envelope = seal_envelope(b"", &dek);
        assert_eq!(open_envelope(&envelope, &dek).unwrap(), Vec::<u8>::new());
    }

    #[test]
    fn dois_envelopes_do_mesmo_banco_sao_diferentes() {
        // Nonce sorteado por upload: sem isso, o servidor veria que o backup
        // nao mudou, que ja e informacao sobre o uso do app.
        let dek = generate_dek();
        let db = b"mesmo conteudo";
        assert_ne!(seal_envelope(db, &dek), seal_envelope(db, &dek));
    }

    #[test]
    fn chave_errada_falha_na_tag_e_nao_devolve_lixo() {
        let envelope = seal_envelope(b"dados do usuario", &dek_fixa(1));
        assert_eq!(open_envelope(&envelope, &dek_fixa(2)), Err(CryptoError::FalhaAoDecifrar));
    }

    #[test]
    fn envelope_adulterado_e_recusado() {
        let dek = generate_dek();
        let mut envelope = seal_envelope(b"dados do usuario", &dek);
        let ultimo = envelope.len() - 1;
        envelope[ultimo] ^= 0xFF;
        assert_eq!(open_envelope(&envelope, &dek), Err(CryptoError::FalhaAoDecifrar));
    }

    #[test]
    fn arquivo_de_outro_formato_e_recusado_antes_de_decifrar() {
        let dek = generate_dek();
        let mut arquivo = vec![0u8; HEADER_LEN + 16];
        arquivo[..4].copy_from_slice(b"%PDF");
        assert_eq!(open_envelope(&arquivo, &dek), Err(CryptoError::MagicInvalido));
    }

    #[test]
    fn versao_futura_e_recusada_com_a_versao_no_erro() {
        let dek = generate_dek();
        let mut envelope = seal_envelope(b"dados", &dek);
        envelope[4] = 99;
        assert_eq!(open_envelope(&envelope, &dek), Err(CryptoError::VersaoNaoSuportada(99)));
    }

    #[test]
    fn envelope_menor_que_o_cabecalho_e_truncado() {
        let dek = generate_dek();
        assert_eq!(open_envelope(&ENVELOPE_MAGIC, &dek), Err(CryptoError::EnvelopeTruncado));
    }

    #[test]
    fn verificador_e_kek_saem_diferentes_da_mesma_senha() {
        // O ponto do desenho: quem captura o verificador nao chega na KEK.
        let params = params_de_teste();
        let salt_auth = [1u8; SALT_LEN];
        let salt_kek = [2u8; SALT_LEN];
        let verificador = derive_verifier("senha do usuario", &salt_auth, params).unwrap();
        let kek = derive_kek("senha do usuario", &salt_kek, params).unwrap();
        assert_ne!(verificador.as_ref(), kek.as_ref());
    }

    #[test]
    fn derivacao_e_deterministica() {
        let params = params_de_teste();
        let salt = [7u8; SALT_LEN];
        assert_eq!(
            derive_kek("senha", &salt, params).unwrap().as_ref(),
            derive_kek("senha", &salt, params).unwrap().as_ref()
        );
    }

    #[test]
    fn senha_diferente_gera_kek_diferente() {
        let params = params_de_teste();
        let salt = [7u8; SALT_LEN];
        assert_ne!(
            derive_kek("senha", &salt, params).unwrap().as_ref(),
            derive_kek("senh4", &salt, params).unwrap().as_ref()
        );
    }

    #[test]
    fn salt_curto_e_recusado() {
        let erro = derive_kek("senha", b"curto", params_de_teste()).unwrap_err();
        assert_eq!(erro, CryptoError::SaltCurto);
    }

    #[test]
    fn dek_embrulhada_volta_igual() {
        let kek = derive_kek("senha", &[3u8; SALT_LEN], params_de_teste()).unwrap();
        let dek = generate_dek();
        let embrulhada = wrap_dek(&dek, &kek);
        assert_eq!(unwrap_dek(&embrulhada, &kek).unwrap().as_ref(), dek.as_ref());
    }

    #[test]
    fn dek_embrulhada_nao_expoe_a_dek() {
        let kek = derive_kek("senha", &[3u8; SALT_LEN], params_de_teste()).unwrap();
        let dek = generate_dek();
        let embrulhada = wrap_dek(&dek, &kek);
        assert!(!embrulhada.windows(KEY_LEN).any(|j| j == dek.as_ref()));
    }

    #[test]
    fn senha_errada_nao_desembrulha_a_dek() {
        let params = params_de_teste();
        let salt = [3u8; SALT_LEN];
        let kek = derive_kek("senha certa", &salt, params).unwrap();
        let embrulhada = wrap_dek(&generate_dek(), &kek);
        let kek_errada = derive_kek("senha errada", &salt, params).unwrap();
        assert_eq!(unwrap_dek(&embrulhada, &kek_errada), Err(CryptoError::FalhaAoDecifrar));
    }

    #[test]
    fn troca_de_senha_preserva_a_dek_sem_recifrar_o_banco() {
        // O caso que justifica o envelope existir: o backup ja no R2 continua
        // valido depois da troca, porque quem muda e o embrulho, nao a DEK.
        let params = params_de_teste();
        let dek = generate_dek();
        let backup = seal_envelope(b"conteudo do banco", &dek);

        let kek_antiga = derive_kek("senha antiga", &[4u8; SALT_LEN], params).unwrap();
        let embrulhada = wrap_dek(&dek, &kek_antiga);

        // Troca: desembrulha com a antiga, re-embrulha com a nova. Salt novo,
        // porque trocar a senha mantendo o salt desperdica metade do beneficio.
        let salt_novo = [5u8; SALT_LEN];
        let recuperada = unwrap_dek(&embrulhada, &kek_antiga).unwrap();
        let kek_nova = derive_kek("senha nova", &salt_novo, params).unwrap();
        let reembrulhada = wrap_dek(&recuperada, &kek_nova);

        let dek_final = unwrap_dek(&reembrulhada, &kek_nova).unwrap();
        assert_eq!(open_envelope(&backup, &dek_final).unwrap(), b"conteudo do banco");
    }

    #[test]
    fn embrulho_truncado_e_recusado() {
        let kek = derive_kek("senha", &[3u8; SALT_LEN], params_de_teste()).unwrap();
        let embrulhada = wrap_dek(&generate_dek(), &kek);
        assert_eq!(
            unwrap_dek(&embrulhada[..NONCE_LEN], &kek),
            Err(CryptoError::EnvelopeTruncado)
        );
    }

    #[test]
    fn parametros_de_producao_sao_aceitos() {
        // Custo real (64 MiB): um teste so, para o padrao nao quebrar em silencio.
        let padrao = KdfParams::default();
        assert_eq!(padrao.m_cost, 64 * 1024);
        assert!(derive_kek("senha", &[9u8; SALT_LEN], padrao).is_ok());
    }

    #[test]
    fn parametros_invalidos_nao_derivam() {
        let absurdo = KdfParams { m_cost: 0, t_cost: 0, p_cost: 0 };
        assert!(matches!(
            derive_kek("senha", &[1u8; SALT_LEN], absurdo),
            Err(CryptoError::ParametrosInvalidos(_))
        ));
    }

    #[test]
    fn salts_gerados_nao_se_repetem() {
        assert_ne!(generate_salt(), generate_salt());
    }
}
