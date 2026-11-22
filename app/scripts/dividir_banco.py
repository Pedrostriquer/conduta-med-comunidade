"""Divide o banco em duas partes, para o navegador não baixar tudo ao entrar.

Roda por último em `npm run dados` (depois de gerar_dados.py e, se houver acervo, de importar_acervo.py).
Lê public/data/questoes.json, que continua existindo inteiro porque o servidor usa, e grava:

  data/indice.json       todas as questões só com o que as telas leem sem abrir a questão: id, prova, número,
                         área, especialidade, tema, gabarito, vídeo, assunto e as marcas ok / anulada / tem figura.
                         Sem enunciado, alternativas, explicação, tabelas, caso nem imagens.
  data/q/<prova>.json    o corpo das questões de cada prova: {id: {e, a, x?, t?, i?, k?}}

Formato do índice (compacto: nomes repetidos viram número de uma tabela; quem lê é src/data/bank.ts):
  {"v": 1, "esp": [...], "tema": [...], "as": [...], "videos": [...], "canais": [...],
   "blocos": [[prova, [linha, ...]], ...]}                na mesma ordem de questoes.json
  linha = [id, número, área, esp, tema, gabarito, marcas]            e, se houver, mais
          [..., assunto]                                              e, se houver vídeo, mais
          [..., assunto ou -1, vídeo, início, fim ou null, canal ou -1]
  área: posição em AREAS. esp, tema, assunto, vídeo, canal: posição na tabela (-1 = não tem).
  marcas: 1 = ok, 2 = anulada, 4 = tem figura.
Só biblioteca padrão. Não muda questoes.json.
"""
import json, os, re, shutil, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RAIZ, "public", "data")
AREAS = ["clinica", "cirurgia", "go", "pediatria", "preventiva"]
CORPO = ("e", "a", "x", "t", "i", "k")
INDICE = {"id", "p", "n", "area", "esp", "tema", "g", "v", "as", "ok", "an"}
NOME_OK = re.compile(r"^[A-Za-z0-9_.-]+$")


def grava(caminho, obj):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho + ".tmp", "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(caminho + ".tmp", caminho)


class Tabela:
    def __init__(self):
        self.itens, self.pos = [], {}

    def de(self, valor):
        if valor is None:
            return -1
        if valor not in self.pos:
            self.pos[valor] = len(self.itens)
            self.itens.append(valor)
        return self.pos[valor]


def main():
    origem = os.path.join(DATA, "questoes.json")
    if not os.path.isfile(origem):
        sys.exit("não achei " + origem + ": rode gerar_dados.py antes")
    questoes = json.load(open(origem, encoding="utf-8"))

    esp, tema, assunto, videos, canais = Tabela(), Tabela(), Tabela(), Tabela(), Tabela()
    blocos, corpos, vistos = [], {}, set()
    for q in questoes:
        sobra = set(q) - INDICE - set(CORPO)
        if sobra:
            sys.exit("campo que este script não conhece em %s: %s. Decida se vai no índice ou no corpo." % (q["id"], sorted(sobra)))
        if q["id"] in vistos:
            sys.exit("id repetido: " + q["id"])
        vistos.add(q["id"])
        if not NOME_OK.match(q["p"]):
            sys.exit("id de prova que não serve de nome de arquivo: " + q["p"])
        marcas = (1 if q.get("ok") else 0) | (2 if q.get("an") else 0) | (4 if q.get("i") else 0)
        linha = [q["id"], q["n"], AREAS.index(q["area"]), esp.de(q.get("esp")), tema.de(q.get("tema")), q["g"], marcas]
        v = q.get("v")
        if v:
            linha += [assunto.de(q.get("as")), videos.de(v["id"]), v["s"], v.get("f"), canais.de(v.get("c"))]
            if set(v) - {"id", "s", "f", "c"}:
                sys.exit("campo novo no vídeo de " + q["id"])
        elif q.get("as"):
            linha.append(assunto.de(q["as"]))
        if not blocos or blocos[-1][0] != q["p"]:
            blocos.append([q["p"], []])
        blocos[-1][1].append(linha)
        corpos.setdefault(q["p"], {})[q["id"]] = {k: q[k] for k in CORPO if k in q}

    pasta = os.path.join(DATA, "q")
    shutil.rmtree(pasta, ignore_errors=True)
    for prova, corpo in corpos.items():
        grava(os.path.join(pasta, prova + ".json"), corpo)
    indice = os.path.join(DATA, "indice.json")
    grava(indice, {"v": 1, "esp": esp.itens, "tema": tema.itens, "as": assunto.itens, "videos": videos.itens, "canais": canais.itens, "blocos": blocos})

    tamanhos = sorted(os.path.getsize(os.path.join(pasta, f)) for f in os.listdir(pasta))
    print("indice.json: %d questões, %.2f MB (questoes.json: %.1f MB)" % (len(questoes), os.path.getsize(indice) / 1e6, os.path.getsize(origem) / 1e6))
    print("q/: %d provas, %.1f MB no total; a maior tem %.0f kB e a mediana %.0f kB" % (len(tamanhos), sum(tamanhos) / 1e6, tamanhos[-1] / 1e3, tamanhos[len(tamanhos) // 2] / 1e3))


if __name__ == "__main__":
    main()
