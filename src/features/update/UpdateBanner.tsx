import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import Button from "../../components/ui/Button";
import {
  abrirInstalador,
  baixarAtualizacao,
  dispensarVersao,
  mensagemDoErro,
  ouvirProgresso,
  pedirPermissaoDeInstalacao,
  permissaoDeInstalacao,
  verificarAtualizacao,
  type ArquivoBaixado,
  type EstadoAtualizacao,
} from "./updateClient";
import {
  deveOferecer,
  formatarTamanho,
  passoAoAceitar,
  percentual,
  podeDispensar,
  rotuloDoDownload,
  type PassoAtualizacao,
} from "./updatePolicy";

/**
 * Faixa de atualização (fase 21).
 *
 * É uma faixa, e não um modal: quem abriu o app veio lançar um gasto, e uma
 * atualização não é urgente o bastante para tomar a tela. A checagem acontece no
 * máximo uma vez por dia (a janela é do Rust) e falha em silêncio -- o app
 * funciona offline por definição.
 *
 * O caminho é sempre o mesmo: pedir, explicar a permissão do sistema **antes**
 * de gastar dado, baixar mostrando o tamanho, e entregar ao instalador do
 * Android. Quem confirma a instalação é o usuário, numa tela do sistema.
 */
export default function UpdateBanner({
  estadoExterno = null,
}: {
  /**
   * Resultado de uma checagem que o usuário pediu em outro lugar da tela (a
   * janela da conta). Chega pronto para a faixa não repetir a ida à rede que
   * acabou de acontecer.
   */
  estadoExterno?: EstadoAtualizacao | null;
}) {
  const [estado, setEstado] = useState<EstadoAtualizacao | null>(null);
  const [passo, setPasso] = useState<PassoAtualizacao>("oculto");
  const [progresso, setProgresso] = useState({ baixados: 0, total: 0 });
  const [baixado, setBaixado] = useState<ArquivoBaixado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    verificarAtualizacao()
      .then((novo) => {
        if (cancelado) return;
        setEstado(novo);
        if (deveOferecer(novo)) setPasso("oferta");
      })
      .catch(() => {
        // Checagem que falha não vira tela. O app continua o mesmo.
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Checagem pedida à mão: adota o resultado e reabre a oferta, inclusive
  // depois de a pessoa ter dispensado esta versão -- pedir de novo é revogar o
  // "agora não".
  useEffect(() => {
    if (!estadoExterno) return;
    setEstado(estadoExterno);
    setPasso(deveOferecer(estadoExterno) ? "oferta" : "oculto");
  }, [estadoExterno]);

  async function aceitar() {
    setErro(null);
    let proximo: PassoAtualizacao;
    try {
      proximo = passoAoAceitar(await permissaoDeInstalacao());
    } catch {
      // Sem resposta do plugin, seguir para o download seria gastar dezenas de
      // MB para esbarrar na permissão no fim. Explicar primeiro custa nada.
      proximo = "permissao";
    }
    setPasso(proximo);
    if (proximo === "baixando") void baixar();
  }

  async function baixar() {
    setPasso("baixando");
    setErro(null);
    setProgresso({ baixados: 0, total: estado?.kind === "disponivel" ? estado.bytes : 0 });
    const parar = await ouvirProgresso((baixados, total) =>
      setProgresso({ baixados, total }),
    );
    try {
      const arquivo = await baixarAtualizacao();
      setBaixado(arquivo);
      setPasso("pronto");
      // Sem clique extra: quem já aceitou baixar 88 MB não precisa confirmar de
      // novo para ver o diálogo do sistema, que é onde a decisão real acontece.
      await abrirInstalador(arquivo.caminho);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
      setPasso("erro");
    } finally {
      parar();
    }
  }

  async function dispensar() {
    if (estado?.kind === "disponivel") {
      try {
        await dispensarVersao(estado.versao);
      } catch {
        // Não conseguir gravar a dispensa custa a faixa aparecer de novo amanhã.
      }
    }
    setPasso("oculto");
  }

  if (passo === "oculto" || estado?.kind !== "disponivel") return null;

  return (
    <section
      aria-label="Atualização disponível"
      className="flex flex-col gap-3 border-b border-border bg-surface px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="text-sm font-medium text-foreground">
              Versão {estado.versao} disponível
            </p>
            <p className="text-sm text-muted-foreground">
              {estado.obrigatoria
                ? "Esta atualização corrige algo que impede o app de funcionar direito."
                : `São ${formatarTamanho(estado.bytes)}. Se puder, use Wi-Fi.`}
            </p>
          </div>
        </div>
        {podeDispensar(estado) && passo === "oferta" && (
          <button
            type="button"
            onClick={dispensar}
            aria-label="Agora não"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {passo === "oferta" && (
        <Button type="button" variant="secondary" onClick={aceitar}>
          {rotuloDoDownload(estado.bytes)}
        </Button>
      )}

      {passo === "permissao" && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
          <p className="text-sm text-foreground">
            O Android precisa da sua autorização para o Contr0l abrir um instalador.
          </p>
          <p className="text-sm text-muted-foreground">
            Vai abrir uma tela do sistema: ligue <strong>Permitir desta fonte</strong> e
            volte para cá. O app não instala nada sozinho — a confirmação final é sempre
            sua, numa tela do próprio Android.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => void pedirPermissaoDeInstalacao().catch(() => setPasso("oferta"))}
            >
              Abrir a permissão
            </Button>
            <Button type="button" variant="secondary" className="flex-1" onClick={baixar}>
              Já autorizei
            </Button>
          </div>
        </div>
      )}

      {passo === "baixando" && (
        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentual(progresso.baixados, progresso.total)}
            className="h-2 w-full overflow-hidden rounded-full bg-background"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${percentual(progresso.baixados, progresso.total)}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Baixando… {formatarTamanho(progresso.baixados)} de{" "}
            {formatarTamanho(progresso.total || estado.bytes)}. Pode continuar usando o app.
          </p>
        </div>
      )}

      {passo === "pronto" && baixado && (
        <p className="text-sm text-muted-foreground">
          Arquivo conferido. O instalador do sistema vai pedir sua confirmação.
        </p>
      )}

      {passo === "erro" && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm font-medium text-destructive">
            {erro}
          </p>
          <Button type="button" variant="secondary" onClick={baixar}>
            Tentar de novo
          </Button>
        </div>
      )}
    </section>
  );
}
