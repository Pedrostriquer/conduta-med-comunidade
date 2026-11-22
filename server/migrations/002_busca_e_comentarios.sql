-- Comentários apagados com respostas continuam na lista da questão, e o índice parcial de 001 não os alcança.
CREATE INDEX comments_qid_all_idx ON comments (qid, parent_id);

-- Mesma normalização do índice de busca dos resumos (sem acento e com radical em português), usada só pelo
-- ts_headline: assim o trecho mostrado na busca preserva os acentos do texto original.
CREATE TEXT SEARCH CONFIGURATION conduta_pt (COPY = portuguese);
ALTER TEXT SEARCH CONFIGURATION conduta_pt
  ALTER MAPPING FOR hword, hword_part, word, asciihword, asciiword, hword_asciipart WITH unaccent, portuguese_stem;
