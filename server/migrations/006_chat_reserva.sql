/* Chat de IA: quando a fonte escolhida falha e a resposta sai pela fonte reserva, fica anotado de qual fonte ela veio. */
ALTER TABLE ai_runs ADD COLUMN fallback_from text;
