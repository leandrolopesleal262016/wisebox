# WiseBox Maker

Aplicacao web para gerar caixas parametrizadas para corte laser com preview 3D, exportacao em `SVG`, `DXF` e `PDF`, inspirada no fluxo do MakerCase.

## O que esta versao entrega

- Flask com interface web responsiva.
- Formulario para largura, altura, profundidade, espessura, kerf, folga, tipo de caixa e tipo de encaixe.
- Preview 3D com Three.js para caixa montada antes da exportacao.
- Gerador vetorial nativo com suporte a:
  - `Caixa fechada`
  - `Caixa aberta`
  - `Caixa com tampa`
  - `Bandeja`
  - `Gaveta`
  - `Caixa com flex cut`
- Exportacao para `SVG`, `DXF` e `PDF`.
- Testes automatizados para validacao e API principal.

## Stack

- Python 3.12
- Flask
- HTML5
- CSS3
- JavaScript
- Bootstrap 5
- Three.js
- ezdxf
- reportlab

## Estrutura

```text
.
├── app.py
├── generated/
├── requirements.txt
├── services/
│   ├── boxes_service.py
│   └── validation_service.py
├── static/
│   ├── css/
│   │   └── style.css
│   ├── generated/
│   └── js/
│       ├── app.js
│       └── preview3d.js
├── templates/
│   └── index.html
└── tests/
```

## Como rodar

```bash
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
flask --app app run
```

A aplicacao sobe em `http://127.0.0.1:5000`.

## Como rodar com Docker

### Build manual

```bash
docker build -t wisebox-maker .
docker run --name wisebox -p 8000:8000 -e SECRET_KEY=troque-esta-chave wisebox-maker
```

### Docker Compose

```bash
docker compose up -d --build
```

A aplicacao sobe em `http://SEU-IP:8000`.

## Deploy na VPS Ubuntu 24

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo systemctl enable --now docker
git clone https://github.com/leandrolopesleal262016/wisebox.git
cd wisebox
docker compose up -d --build
```

Para verificar:

```bash
docker compose ps
docker compose logs -f
curl http://127.0.0.1:8000/healthz
```

Se quiser trocar a porta publica, rode:

```bash
WISEBOX_PORT=80 docker compose up -d --build
```

## Como testar

```bash
pytest
```

## API principal

- `GET /` -> interface principal
- `GET /healthz` -> healthcheck para Docker e monitoramento
- `POST /api/preview-data` -> devolve dados normalizados para o preview 3D
- `POST /api/generate` -> gera o arquivo no formato escolhido
- `GET /download/<file>` -> faz o download do arquivo gerado

## Observacoes tecnicas

- Os arquivos gerados sao salvos em `static/generated/`.
- No Docker, `static/generated/` usa um volume nomeado do Docker para persistir os arquivos entre reinicios do container e evitar problemas de permissao no host.
- O preview 3D desta versao mostra volume, proporcao e espessura. Os dentes detalhados do encaixe ficam no arquivo vetorial.
- O projeto foi estruturado para permitir uma integracao futura com `Boxes.py`, mas esta entrega usa um motor vetorial nativo para manter instalacao e execucao simples no Windows.
