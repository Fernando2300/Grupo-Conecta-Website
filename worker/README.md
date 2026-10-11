# Worker do painel (Cloudflare)

O `index.js` é o código do Worker `conecta-painel`. Faz de intermediário entre o painel (`admin.html`) e o GitHub: verifica a senha de cada membro, lê e grava `data/site.json` na branch `content` e dispara a publicação. **O token do GitHub vive só aqui**, como segredo; nunca vai para o browser nem para o repositório.

Esta pasta **não faz parte do site publicado** (o workflow do Pages deixa-a de fora). Não ponha segredos em nenhum ficheiro desta pasta.

## Ficheiros
- `index.js`: o código do Worker (um único ficheiro, para colar no editor da Cloudflare).
- `gerar-senhas.mjs`: corre no seu computador (Node 18+); gera os *hashes* das senhas e a chave das sessões. Não grava nada em ficheiros.

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

### 4. Segredos (tipo *Secret*)
| Nome | De onde vem |
|---|---|
| `SENHAS` | linha JSON que o `gerar-senhas.mjs` escreve |
| `SESSAO_SEGREDO` | texto que o `gerar-senhas.mjs` escreve |
| `GITHUB_TOKEN` | token fine-grained do GitHub (criado no Passo 10) |

Gerar `SENHAS` e `SESSAO_SEGREDO`, na pasta do projecto:

```powershell
node worker/gerar-senhas.mjs
```

O script pede a senha de cada membro (não aparece no ecrã; mínimo 16 caracteres, uma frase longa) e escreve o JSON dos *hashes*. **As senhas em si nunca são escritas.** Envie a cada membro a sua senha por mensagem directa, nunca no grupo.

> Só gere um novo `SESSAO_SEGREDO` se for mesmo preciso: trocá-lo termina todas as sessões abertas.

### 5. Teste de vida
Abra o endereço do Worker (`https://conecta-painel.....workers.dev`) no browser. Deve aparecer `{"ok":true,"servico":"conecta-painel"}`.

## Operação do dia-a-dia
- **Trocar a senha de um membro:** correr o script, deixar os outros em branco e juntar a entrada nova ao JSON do segredo `SENHAS`.
- **Revogar um membro:** retirar a sua entrada do segredo `SENHAS`. A sessão dele deixa de funcionar no pedido seguinte.
- **Token do GitHub:** expira no máximo ao fim de 1 ano. Marcar a renovação no calendário e actualizar o segredo `GITHUB_TOKEN`.
- **Alterar o código:** editar `worker/index.js` no repositório e colar de novo no editor da Cloudflare (o repositório é a cópia de referência).

## Segurança, em resumo
- Sessão: token assinado (HMAC-SHA256), expira ao fim de 30 minutos sem actividade e no máximo ao fim de 8 horas. Renova-se a cada pedido.
- Entrada: 5 falhas por membro ou 20 por IP bloqueiam durante 15 minutos. Se o KV falhar, ninguém entra.
- Só escreve `data/site.json` na branch `content`; recusa qualquer outro caminho ou branch.
- Valida os dados no servidor com as mesmas regras do painel; limpa o HTML da descrição; grava o `titular` sempre vazio.
- CORS só para as origens de `ORIGENS`.
- Limite conhecido: bloquear tentativas por membro permite que alguém mal-intencionado bloqueie um membro durante 15 minutos (não consegue entrar por isso). Aceite.