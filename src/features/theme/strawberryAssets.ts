import type { BalanceMood } from "../dashboard/balanceMood";
import alert from "../../assets/moranguinho/alert.png";
import celebrating from "../../assets/moranguinho/celebrating.png";
import debt from "../../assets/moranguinho/debt.png";
import happy from "../../assets/moranguinho/happy.png";
import recovering from "../../assets/moranguinho/recovering.png";
import steady from "../../assets/moranguinho/steady.png";

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
