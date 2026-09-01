/**
 * Validacao do formulario de conta.
 *
 * Fica fora do componente porque e regra, nao layout: e o unico ponto onde o
 * app decide o que aceita como senha, e isso precisa de teste.
 */

export type ModoConta = "entrar" | "criar";

/** Menos que isto nao sustenta o Argon2id contra quem tiver o dump do servidor. */
export const SENHA_MINIMA = 10;

export interface CamposConta {
  email: string;
  senha: string;
  confirmacao: string;
  /** So no cadastro: o usuario precisa marcar que entendeu a perda de senha. */
  cienteDaPerda: boolean;
}

export function camposVazios(): CamposConta {
  return { email: "", senha: "", confirmacao: "", cienteDaPerda: false };
}

/**
 * Devolve a mensagem do primeiro problema, ou `null` se pode enviar.
 *
 * Uma mensagem por vez, e nao uma lista: o formulario tem quatro campos e
 * despejar tudo de uma vez atrapalha mais do que ajuda.
 */
export function validarConta(modo: ModoConta, campos: CamposConta): string | null {
  const email = campos.email.trim();
  if (!email) return "Informe o e-mail.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "E-mail invalido.";
  if (!campos.senha) return "Informe a senha.";

  // No login nao se valida forca: a senha ja existe, e recusar aqui trancaria
  // fora quem criou a conta quando a regra era outra.
  if (modo === "entrar") return null;

  if (campos.senha.length < SENHA_MINIMA) {
    return `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`;
  }
  if (campos.senha !== campos.confirmacao) return "As senhas nao conferem.";
  if (!campos.cienteDaPerda) {
    return "Confirme que entendeu: sem a senha, o backup nao pode ser recuperado.";
  }
  return null;
}

/** E-mail como o servidor vai guardar. Evita cadastrar o mesmo e-mail duas vezes. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Palavra que confirma a exclusao da conta. O mesmo texto e exigido pelo
 * comando Rust e pelo gateway -- ver `CONFIRMACAO_EXCLUSAO` em `cloud.rs`.
 */
export const CONFIRMACAO_EXCLUSAO = "APAGAR";

/**
 * Digitar segura o que dois botoes de "tem certeza?" nao seguram: apagar a
 * conta e o backup e irreversivel, e com criptografia ponta a ponta nao existe
 * quem devolva depois.
 *
 * Aceita espaco em volta e caixa qualquer -- recusar "apagar" porque a tecla de
 * maiuscula estava desligada seria implicancia, nao seguranca.
 */
export function confirmacaoDeExclusaoValida(digitado: string): boolean {
  return digitado.trim().toUpperCase() === CONFIRMACAO_EXCLUSAO;
}
