import type { BalanceMood } from "../dashboard/balanceMood";
import alert from "../../assets/moranguinho/alert.png";
import celebrating from "../../assets/moranguinho/celebrating.png";
import debt from "../../assets/moranguinho/debt.png";
import happy from "../../assets/moranguinho/happy.png";
import recovering from "../../assets/moranguinho/recovering.png";
import steady from "../../assets/moranguinho/steady.png";
import custard from "../../assets/moranguinho/custard.png";
import pupcake from "../../assets/moranguinho/pupcake.png";

/**
 * Mascote do totalizador de entradas.
 *
 * Resolvido por padrao de nome em vez de import fixo: basta salvar o arquivo
 * como `src/assets/moranguinho/entradas.<ext>` que ele passa a ser usado, sem
 * editar codigo. Enquanto nao existir, `import.meta.glob` devolve um objeto
 * vazio e o card renderiza sem mascote -- o build nao quebra nos dois casos.
 */
const ENTRADAS_ENCONTRADAS: Record<string, string> = import.meta.glob(
  "../../assets/moranguinho/entradas.*",
  { eager: true, query: "?url", import: "default" },
);

const entradas: string | undefined = Object.values(ENTRADAS_ENCONTRADAS)[0];

export const STRAWBERRY_DECORATIVE_ASSETS: {
  custard: string;
  pupcake: string;
  entradas?: string;
} = {
  custard,
  pupcake,
  entradas,
};

export const STRAWBERRY_MOOD_ASSETS: Record<
  BalanceMood,
  { src: string; alt: string; message: string }
> = {
  debt: {
    src: debt,
    alt: "Moranguinho preocupada com o saldo negativo",
    message: "O saldo está negativo. Reveja as próximas saídas com calma.",
  },
  alert: {
    src: alert,
    alt: "Moranguinho atenta ao saldo baixo",
    message: "O saldo está baixo. Vale acompanhar os próximos gastos.",
  },
  recovering: {
    src: recovering,
    alt: "Moranguinho acompanhando a recuperação do saldo",
    message: "Seu saldo está se recuperando. Continue assim.",
  },
  steady: {
    src: steady,
    alt: "Moranguinho tranquila com o saldo estável",
    message: "Seu saldo está estável.",
  },
  happy: {
    src: happy,
    alt: "Moranguinho feliz com o saldo confortável",
    message: "Seu saldo está confortável.",
  },
  celebrating: {
    src: celebrating,
    alt: "Moranguinho comemorando o saldo alto",
    message: "Seu saldo está ótimo. Hora de comemorar!",
  },
};
