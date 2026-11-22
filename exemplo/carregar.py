"""Carrega os dados de exemplo (20 itens ficticios, sem conteudo medico) para o app e o servidor rodarem.

Uso (da raiz do repositorio):   python3 exemplo/carregar.py

O que faz:
1. copia provas.json, questoes.json e assuntos.json desta pasta para app/public/data/
2. roda app/scripts/gerar_amostra.mjs (as questoes que aparecem sem conta, na tela de entrar)
3. roda app/scripts/dividir_banco.py (o indice e o corpo das questoes por prova, que o navegador baixa)

O servidor le app/public/data/questoes.json direto (DATA_DIR no server/.env).
Se ja houver um banco que nao e o de exemplo em app/public/data, o script para sem mexer em nada.
So biblioteca padrao. Precisa do Node (para o passo 2).
"""
import json
import os
import shutil
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
APP = os.path.join(RAIZ, "app")
DADOS = os.path.join(APP, "public", "data")


def main():
    atual = os.path.join(DADOS, "questoes.json")
    if os.path.isfile(atual):
        try:
            ids = [q["id"] for q in json.load(open(atual, encoding="utf-8"))]
        except (ValueError, KeyError, TypeError):
            ids = ["?"]
        if any(not str(i).startswith("EXEMPLO-") for i in ids):
            sys.exit("app/public/data/questoes.json ja tem um banco que nao e o de exemplo. Nada foi alterado.")
    os.makedirs(DADOS, exist_ok=True)
    for nome in ("provas.json", "questoes.json", "assuntos.json"):
        shutil.copyfile(os.path.join(AQUI, nome), os.path.join(DADOS, nome))
        print("copiado: app/public/data/" + nome, flush=True)
    subprocess.run(["node", os.path.join("scripts", "gerar_amostra.mjs")], cwd=APP, check=True)
    subprocess.run([sys.executable, os.path.join("scripts", "dividir_banco.py")], cwd=APP, check=True)
    print("pronto: dados de exemplo carregados")


if __name__ == "__main__":
    main()
