import { useState, type FormEvent } from "react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import {
  camposVazios,
  confirmacaoDeExclusaoValida,
  CONFIRMACAO_EXCLUSAO,
  normalizarEmail,
  validarConta,
  type CamposConta,
  type ModoConta,
} from "./accountForm";
import {
  apagarConta,
  criarConta,
  entrar,
  mensagemDoErro,
  sair,
  type Sessao,
} from "./authClient";
import { enviarBackup, restaurarBackup } from "../../lib/cloud/sync";

/** Aviso curto sobre a ultima operacao de backup. */
interface AvisoBackup {
  tipo: "ok" | "erro" | "conflito";
  texto: string;
}

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  sessao: Sessao | null;
  onSessao: (sessao: Sessao | null) => void;
}

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-ring";

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

/**
 * Conta na nuvem: entrar, criar e sair.
 *
 * E um modal, e nao uma aba, de proposito. A fase 20 fixou que o portao de
 * acesso nao pode virar uma segunda camada de telas -- o app abre e funciona
 * sem conta, e quem nunca cadastrar nunca ve isto.
 */
export default function AccountModal({ open, onClose, sessao, onSessao }: AccountModalProps) {
  const [modo, setModo] = useState<ModoConta>("entrar");
  const [campos, setCampos] = useState<CamposConta>(camposVazios());
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [backup, setBackup] = useState<AvisoBackup | null>(null);
  const [exclusao, setExclusao] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const ocupado = enviando;

  const altera = <K extends keyof CamposConta>(chave: K, valor: CamposConta[K]) => {
    setCampos((atual) => ({ ...atual, [chave]: valor }));
    setErro(null);
  };

  const trocarModo = (novo: ModoConta) => {
    setModo(novo);
    setCampos(camposVazios());
    setErro(null);
  };

  const fechar = () => {
    setCampos(camposVazios());
    setErro(null);
    // A area de exclusao nao pode continuar aberta na proxima vez que o modal
    // subir: reabrir com o campo pronto convida ao acidente.
    setExclusao(false);
    setConfirmacao("");
    onClose();
  };

  async function enviar(event: FormEvent) {
    event.preventDefault();
    const problema = validarConta(modo, campos);
    if (problema) {
      setErro(problema);
      return;
    }

    setEnviando(true);
    setErro(null);
    try {
      const email = normalizarEmail(campos.email);
      // A senha vai direto para o comando Rust: ela nao e guardada em estado
      // nenhum alem do campo, e nunca vira requisicao daqui.
      const nova = modo === "criar" ? await criarConta(email, campos.senha) : await entrar(email, campos.senha);
      onSessao(nova);
      setCampos(camposVazios());
      onClose();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setEnviando(false);
    }
  }

  async function subirBackup() {
    setEnviando(true);
    setBackup(null);
    try {
      const r = await enviarBackup();
      setBackup(
        r.kind === "enviado"
          ? { tipo: "ok", texto: `Backup enviado (versão ${r.version}).` }
          : {
              tipo: "conflito",
              // Nao funde e nao sobrescreve: a escolha e do usuario, e ela
              // ainda nao existe como fluxo -- ver a spec da fase 11/17.
              texto:
                `Outro aparelho enviou um backup mais novo (versão ${r.version_servidor}; ` +
                `este partiu da ${r.version_local}). Restaure antes de enviar, ou você perde um dos dois.`,
            },
      );
    } catch (falha) {
      setBackup({ tipo: "erro", texto: mensagemDoErro(falha) });
    } finally {
      setEnviando(false);
    }
  }

  async function restaurar() {
    setEnviando(true);
    setBackup(null);
    try {
      const r = await restaurarBackup();
      setBackup({
        tipo: "ok",
        texto: `Backup baixado (versão ${r.version}). Feche e abra o app para concluir.`,
      });
    } catch (falha) {
      setBackup({ tipo: "erro", texto: mensagemDoErro(falha) });
    } finally {
      setEnviando(false);
    }
  }

  async function apagar() {
    setEnviando(true);
    setErro(null);
    try {
      await apagarConta(confirmacao);
      setExclusao(false);
      setConfirmacao("");
      onSessao(null);
      onClose();
    } catch (falha) {
      // A falha aparece dentro da propria area de exclusao. Mandada para o
      // aviso de backup, ela diria "erro" logo acima de dois botoes que nao
      // foram os tocados.
      setErro(mensagemDoErro(falha));
    } finally {
      setEnviando(false);
    }
  }

  async function encerrar() {
    setEnviando(true);
    try {
      await sair();
      onSessao(null);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal open={open} onClose={fechar} title={sessao ? "Sua conta" : "Conta na nuvem"}>
      {sessao ? (
        <div className="flex flex-col gap-4 p-4">
          <div>
            <p className="text-sm text-muted-foreground">Conectado como</p>
            <p className="text-sm font-medium text-foreground">{sessao.email}</p>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
            <p className="text-sm font-medium text-foreground">Backup na nuvem</p>
            <p className="text-sm text-muted-foreground">
              Seus lançamentos continuam neste aparelho. O backup sobe cifrado com a sua
              senha — o servidor guarda um arquivo que não consegue abrir.
            </p>

            {backup && (
              <p
                role="status"
                className={`text-sm ${
                  backup.tipo === "erro" || backup.tipo === "conflito"
                    ? "font-medium text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {backup.texto}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={subirBackup}
                disabled={ocupado}
              >
                Enviar agora
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={restaurar}
                disabled={ocupado}
              >
                Restaurar
              </Button>
            </div>
          </div>

          <Button type="button" variant="ghost" onClick={encerrar} disabled={ocupado}>
            Sair da conta
          </Button>

          {/* Apagar a conta e um direito (LGPD art. 18), entao mora aqui e nao
              num e-mail de suporte. Fica atras de um clique e de uma palavra
              digitada porque e irreversivel -- e, com E2E, irreversivel de
              verdade: nao ha copia legivel para devolver. */}
          {exclusao ? (
            <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-background p-3">
              <p className="text-sm font-medium text-destructive">Apagar a conta</p>
              <p className="text-sm text-muted-foreground">
                Apaga do servidor a conta, o e-mail e o backup cifrado. Não há como
                desfazer, e não existe cópia legível para devolver depois.
              </p>
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">
                  Seus lançamentos continuam neste aparelho.
                </strong>{" "}
                O app volta a funcionar sem conta, como antes de você criar uma.
              </p>
              <div>
                <label className={labelClass} htmlFor="conta-confirmacao-exclusao">
                  Digite {CONFIRMACAO_EXCLUSAO} para confirmar
                </label>
                <input
                  id="conta-confirmacao-exclusao"
                  type="text"
                  autoComplete="off"
                  className={inputClass}
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setExclusao(false);
                    setConfirmacao("");
                  }}
                  disabled={ocupado}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="flex-1"
                  onClick={apagar}
                  disabled={ocupado || !confirmacaoDeExclusaoValida(confirmacao)}
                >
                  Apagar para sempre
                </Button>
              </div>

              {erro && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {erro}
                </p>
              )}
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => setExclusao(true)}
              disabled={ocupado}
            >
              Apagar minha conta
            </Button>
          )}
        </div>
      ) : (
        <form className="flex flex-col gap-4 p-4" onSubmit={enviar}>
          <p className="text-sm text-muted-foreground">
            A conta serve para guardar um backup cifrado e recuperá-lo se você trocar de
            aparelho. O app continua funcionando sem ela.
          </p>

          <div>
            <label className={labelClass} htmlFor="conta-email">
              E-mail
            </label>
            <input
              id="conta-email"
              type="email"
              autoComplete="email"
              className={inputClass}
              value={campos.email}
              onChange={(e) => altera("email", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="conta-senha">
              Senha
            </label>
            <input
              id="conta-senha"
              type="password"
              autoComplete={modo === "criar" ? "new-password" : "current-password"}
              className={inputClass}
              value={campos.senha}
              onChange={(e) => altera("senha", e.target.value)}
            />
          </div>

          {modo === "criar" && (
            <>
              <div>
                <label className={labelClass} htmlFor="conta-confirmacao">
                  Repita a senha
                </label>
                <input
                  id="conta-confirmacao"
                  type="password"
                  autoComplete="new-password"
                  className={inputClass}
                  value={campos.confirmacao}
                  onChange={(e) => altera("confirmacao", e.target.value)}
                />
              </div>

              {/* Isto precisa estar na cara do usuario, e nao nos termos: com
                  criptografia ponta a ponta nao existe "recuperar conta". */}
              <label className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0"
                  checked={campos.cienteDaPerda}
                  onChange={(e) => altera("cienteDaPerda", e.target.checked)}
                />
                <span>
                  Entendo que <strong>só eu tenho a chave</strong>. Se eu esquecer esta senha,
                  o backup não pode ser recuperado por ninguém — nem por você.
                </span>
              </label>
            </>
          )}

          {erro && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {erro}
            </p>
          )}

          <Button type="submit" disabled={enviando}>
            {enviando ? "Aguarde…" : modo === "criar" ? "Criar conta" : "Entrar"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => trocarModo(modo === "criar" ? "entrar" : "criar")}
          >
            {modo === "criar" ? "Já tenho conta" : "Criar uma conta"}
          </Button>
        </form>
      )}
    </Modal>
  );
}
