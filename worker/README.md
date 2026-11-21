# Worker do painel (Cloudflare)

O `index.js` é o código do Worker `conecta-painel`. Faz de intermediário entre o painel (`admin.html`) e o GitHub: verifica a senha de cada membro, lê e grava `data/site.json` e `data/certificados-painel.json` na branch `content` e dispara a publicação. Também assina os envios de certificados ao Cloudinary (o ficheiro vai do browser directamente para o Cloudinary; o API secret fica só aqui). **O token do GitHub vive só aqui**, como segredo; nunca vai para o browser nem para o repositório.

Esta pasta **não faz parte do site publicado** (o workflow do Pages deixa-a de fora). Não ponha segredos em nenhum ficheiro desta pasta.

## Ficheiros
- `index.js`: o código do Worker (um único ficheiro, para colar no editor da Cloudflare).
- `gerar-senhas.mjs`: corre no seu computador (Node 18+); gera os *hashes* das senhas e a chave das sessões. Não grava nada em ficheiros.
- `enviar-certificados.mjs`: corre no seu computador (Node 18+); envia os PDF e PNG dos certificados para o Cloudinary (ver secção no fim).

## Configuração (uma vez)

### 1. Código
Cloudflare, Workers & Pages, `conecta-painel`, **Edit code**: apague o que lá está, cole o conteúdo de `index.js` e clique em **Deploy**.

### 2. Armazenamento KV
Em **Settings, Bindings, Add, KV namespace**: nome da variável `LIMITES`, namespace `conecta-limites`.

### 3. Variáveis de texto (Settings, Variables and Secrets, tipo *Text*)
| Nome | Valor |
|---|---|
| `REPO` | `Fernando2300/Grupo-Conecta-Website` |
| `ORIGENS` | `https://grupoconecta.ligados.net,http://127.0.0.1:5500` |
| `WORKFLOW` | opcional; omissão `pages.yml` |
| `CLOUDINARY_CLOUD` | `y1pydrcc` |

### 4. Segredos (tipo *Secret*)
| Nome | De onde vem |
|---|---|
| `SENHAS` | linha JSON que o `gerar-senhas.mjs` escreve |
| `SESSAO_SEGREDO` | texto que o `gerar-senhas.mjs` escreve |
| `GITHUB_TOKEN` | token fine-grained do GitHub (criado no Passo 10) |
| `CLOUDINARY_API_KEY` | API Key da chave `painel-worker` (Cloudinary, Settings, API Keys) |
| `CLOUDINARY_API_SECRET` | API Secret dessa mesma chave |

Sem as três configurações do Cloudinary, as rotas de certificados respondem 500 ("Cloudinary não configurado no Worker"); o resto do painel continua a funcionar.

Gerar `SENHAS` e `SESSAO_SEGREDO`, na pasta do projecto:

```powershell
node worker/gerar-senhas.mjs
```

O script pede a senha de cada membro (não aparece no ecrã; mínimo 16 caracteres, uma frase longa) e escreve o JSON dos *hashes*. **As senhas em si nunca são escritas.** Envie a cada membro a sua senha por mensagem directa, nunca no grupo.

> Só gere um novo `SESSAO_SEGREDO` se for mesmo preciso: trocá-lo termina todas as sessões abertas.

### 5. Teste de vida
Abra o endereço do Worker (`https://conecta-painel.....workers.dev`) no browser. Deve aparecer `{"ok":true,"servico":"conecta-painel"}`. (Este teste não usa sessão nem as chaves do Cloudinary; as rotas novas testam-se no painel, separador **Certificados**, botão **Verificar ficheiros**.)

## Rotas
| Rota | Para quê |
|---|---|
| `GET /` | teste de vida |
| `POST /login`, `POST /logout` | entrada e saída |
| `GET /site`, `PUT /site` | ler e publicar `data/site.json` |
| `GET /historico?ficheiro=site` ou `?ficheiro=certificados` | últimas 20 versões (omissão `site`) |
| `POST /restaurar?ficheiro=site` ou `?ficheiro=certificados` | voltar a uma versão (omissão `site`) |
| `GET /certificados` | ler `data/certificados-painel.json` (lista vazia se ainda não existir) |
| `PUT /certificados` | `{certificados:[...]}`, até 300; valida, junta por código (nunca apaga) e publica |
| `POST /certificados/assinatura` | `{itens:[{codigo, tipo}]}`, até 25; devolve as assinaturas para o Cloudinary e regista a auditoria no KV (`auditoria:cert:`, 180 dias) |
| `GET /certificados/ficheiros` | códigos com PDF e com PNG no Cloudinary (Admin API) |

Todas, excepto `GET /` e `POST /login`, exigem sessão.

## Operação do dia-a-dia
- **Trocar a senha de um membro:** correr o script, deixar os outros em branco e juntar a entrada nova ao JSON do segredo `SENHAS`.
- **Revogar um membro:** retirar a sua entrada do segredo `SENHAS`. A sessão dele deixa de funcionar no pedido seguinte.
- **Token do GitHub:** expira no máximo ao fim de 1 ano. Marcar a renovação no calendário e actualizar o segredo `GITHUB_TOKEN`.
- **Alterar o código:** editar `worker/index.js` no repositório e colar de novo no editor da Cloudflare (o repositório é a cópia de referência).

## Segurança, em resumo
- Sessão: token assinado (HMAC-SHA256), expira ao fim de 30 minutos sem actividade e no máximo ao fim de 8 horas. Renova-se a cada pedido.
- Entrada: 5 falhas por membro ou 20 por IP bloqueiam durante 15 minutos. Se o KV falhar, ninguém entra.
- Só escreve `data/site.json` e `data/certificados-painel.json` na branch `content` (lista fechada); recusa qualquer outro caminho ou branch.
- Certificados: valida cada entrada (campos permitidos, sem `<` nem `>`, datas reais); as assinaturas só cobrem `certificados/pdf|png/CÓDIGO` com `allowed_formats` assinado; o API secret nunca é devolvido nem escrito em registos.
- Valida os dados no servidor com as mesmas regras do painel; limpa o HTML da descrição; grava o `titular` sempre vazio.
- CORS só para as origens de `ORIGENS`.
- Limite conhecido: bloquear tentativas por membro permite que alguém mal-intencionado bloqueie um membro durante 15 minutos (não consegue entrar por isso). Aceite.

## Envio dos certificados para o Cloudinary (`enviar-certificados.mjs`)

Corre no seu computador (Node 18 ou superior, sem instalar nada). Envia os PDF e PNG exportados do Canva para o Cloudinary, com o public ID `certificados/pdf/CÓDIGO` e `certificados/png/CÓDIGO`. Serve para o primeiro lote (Workshops 6 e 7) e como alternativa se o painel estiver indisponível. Não vai para o site publicado e não grava nada em ficheiros.

### Chave de API só para este script
1. Cloudinary, **Settings** (roda dentada), **API Keys**, **Generate New API Key**.
2. Dê-lhe o nome `script-certificados` (fica separada da chave `painel-worker` que o Worker usa).
3. Copie a **API Key** e o **API Secret** só quando os for colar no PowerShell. Não os guarde em ficheiros nem os envie a ninguém.

### Variáveis (só nesta janela do PowerShell)
```powershell
$env:CLOUDINARY_API_KEY = "cole-aqui-a-chave"
$env:CLOUDINARY_API_SECRET = "cole-aqui-o-segredo"
# opcional; por omissão y1pydrcc
$env:CLOUDINARY_CLOUD_NAME = "y1pydrcc"
```
Ao fechar a janela, as variáveis desaparecem.

### Uso
```powershell
# 1. Simulação (não envia nada; não precisa das variáveis)
node worker/enviar-certificados.mjs --pdf "C:\Certificados\WS7\pdf" --png "C:\Certificados\WS7\png" --dados assets/certificados-ws7.json

# 2. Envio a sério
node worker/enviar-certificados.mjs --pdf "C:\Certificados\WS7\pdf" --png "C:\Certificados\WS7\png" --dados assets/certificados-ws7.json --enviar
```
Pode repetir `--dados` (por exemplo `--dados assets/certificados-ws6.json --dados assets/certificados-ws7.json`) e indicar só `--pdf` ou só `--png`.

### O que verifica antes de enviar
- Cada nome de ficheiro tem exactamente um código válido (`CON-WS7-2026-11-001.pdf`). Maiúsculas e minúsculas são aceites; nomes como `CON-WS7-2026-11-001 (1).png` são aceites com aviso.
- Extensão `.pdf` na pasta PDF e `.png` na pasta PNG, e conteúdo real (cabeçalho do ficheiro).
- No máximo 10 MB por ficheiro; nenhum código repetido em dois ficheiros.
- Os códigos dos `--dados` sem PDF ou PNG aparecem em "Em falta" (aviso).
- Ficheiros com código fora dos dados aparecem como aviso e **não** são enviados (use `--incluir-extra` se quiser enviá-los).
- Se houver **erros**, não envia nada.

### Envio e relatório
3 envios em paralelo, até 3 tentativas por ficheiro, 60 s por envio. No fim confirma cada endereço público (deve responder 200) e mostra o relatório (enviados, falhados, em falta, avisos). Sai com código diferente de 0 se houve erros. Pode correr várias vezes: os ficheiros são substituídos (o mesmo código fica com a versão mais recente).

Se o Cloudinary responder com erro sobre `asset_folder`, abra o script e mude `USAR_ASSET_FOLDER = true` para `false` (o public ID não muda).
