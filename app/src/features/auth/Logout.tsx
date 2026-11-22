/* Sair da conta, à vista: ao lado do cartão do perfil na barra lateral e no topo do Perfil. Pergunta antes,
   porque o que ainda não foi enviado sai deste navegador. */
import { useState } from "react";
import { Button } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Dialog } from "../../ds/overlay";
import { plural } from "../../lib/format";
import { useAuth } from "../../state/auth";
import { useSyncStatus } from "../../sync/engine";

export function LogoutButton({ compact }: { /** só o ícone, para a barra lateral */ compact?: boolean }) {
  const signOut = useAuth((x) => x.signOut);
  const sync = useSyncStatus();
  const [open, setOpen] = useState(false);
  return (
    <>
      {compact ? (
        <button type="button" className="ui-side__out cd-hoverable" onClick={() => setOpen(true)} aria-label="Sair da conta" title="Sair da conta">
          <Icon name="door" size={16} />
        </button>
      ) : <Button variant="plain" size="sm" onClick={() => setOpen(true)}>Sair</Button>}
      <Dialog open={open} onClose={() => setOpen(false)} confirmLabel="Sair" title="Sair da conta?" onConfirm={() => { void signOut(); }}>
        {sync.pending && sync.state === "sem_conexao"
          ? `Sem conexão, ${plural(sync.pending, "item ainda não foi enviado e será perdido", "itens ainda não foram enviados e serão perdidos")} ao sair. Se puder, espere a internet voltar.`
          : "Seus estudos continuam na sua conta. O que estava guardado neste navegador sai daqui."}
      </Dialog>
    </>
  );
}
