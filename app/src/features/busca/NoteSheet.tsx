/* Anotar uma questão: folha com um campo de texto. Guardar vazio apaga a anotação. */
import { useEffect, useState } from "react";
import { useStore } from "../../state/store";
import { Button } from "../../ds/basics";
import { Sheet, useToast } from "../../ds/overlay";
import { relativeDay, dayKey } from "../../lib/format";

const when = (at: number) => { const d = relativeDay(dayKey(at)); return /^\d/.test(d) ? "em " + d : d; };

export function NoteSheet({ qid, open, onClose, subtitle }: { qid: string; open: boolean; onClose: () => void; subtitle?: string }) {
  const note = useStore((s) => s.notes[qid]);
  const [text, setText] = useState(note?.text || "");
  const toast = useToast();
  useEffect(() => { if (open) setText(useStore.getState().notes[qid]?.text || ""); }, [open, qid]);
  const save = () => {
    useStore.getState().setNote(qid, text);
    onClose();
    toast({ text: text.trim() ? "Anotação guardada." : "Anotação apagada.", icon: "note", duration: 2400 });
  };
  return (
    <Sheet open={open} onClose={onClose} title={note ? "Editar anotação" : "Anotar questão"} subtitle={subtitle} width={520}
      footer={
        <div className="note__foot">
          {note ? <Button variant="plain" onClick={() => { useStore.getState().setNote(qid, ""); onClose(); toast({ text: "Anotação apagada.", icon: "note", duration: 2400 }); }}>Apagar</Button> : <span />}
          <div className="cd-row"><Button variant="gray" onClick={onClose}>Cancelar</Button><Button variant="filled" onClick={save}>Guardar</Button></div>
        </div>
      }>
      <label className="note__field">
        <span className="cd-sr">Anotação</span>
        <textarea data-autofocus="" value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={2000}
          placeholder="O que você quer lembrar desta questão? Uma pegadinha, um conceito, por que errou…"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); } }} />
      </label>
      <p className="note__hint">{note ? `Anotada ${when(note.at)}. ` : ""}A anotação aparece depois que você responde, na correção e em Questões salvas.</p>
    </Sheet>
  );
}
