/* Espera do corpo da questão (enunciado, alternativas, explicação), que vem por prova depois do índice:
   o pulso enquanto baixa e, se a rede falhar, o aviso com "Tentar de novo". `full` ocupa a tela toda (antes da sessão abrir). */
import { Button } from "../../ds/basics";
import { Pulse } from "../../ds/medical";

export function BodyWait({ error, retry, full, label = "Carregando a questão" }: { error: boolean; retry: () => void; full?: boolean; label?: string }) {
  return (
    <div className={full ? "splash cd-root" : "qwait"} role="status" aria-live="polite">
      {error ? (
        <>
          <p className="splash__err">Não foi possível carregar as questões. Confira a conexão e tente de novo.</p>
          <Button variant="gray" onClick={retry}>Tentar de novo</Button>
        </>
      ) : <Pulse size={full ? 88 : 64} label={label} />}
    </div>
  );
}
