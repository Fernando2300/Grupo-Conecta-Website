# Guia de Fluxo Git - Grupo Conecta Website

Para a equipa do site. Seguir sempre esta ordem, para não haver erros em produção.

---

## A regra de ouro

| Branch | Para quê | Vai para o ar? |
|---|---|---|
| `develop` | Trabalho do dia-a-dia | Não |
| `main` | Versão estável e aprovada | Sim, automaticamente via GitHub Pages |

**Nunca fazer push directamente na `main`.** Todo o trabalho acontece em `develop` (ou numa branch `feature/...`) e só vai para a `main` quando estiver testado e aprovado.

A `main` está ligada ao site `grupoconecta.ligados.net` (ficheiro `CNAME`). Tudo o que entra na `main` fica público ao fim de 1 a 2 minutos.

---

## Fluxo do dia-a-dia

### 1. Antes de começar a trabalhar

Garantir que a `develop` está actualizada:

```bash
git checkout develop
git pull origin develop
```

### 2. Fazer as alterações

Editar os ficheiros e testar com o **Live Server** do VS Code (abrir a pasta do projecto, não um ficheiro solto). Recarregar com `Ctrl+Shift+R` para evitar JavaScript em cache.

### 3. Guardar o trabalho (commit)

Ver sempre o que mudou antes de guardar:

```bash
git status
```

Adicionar **só os ficheiros que alterou**, pelo nome:

```bash
git add js/inscricao.js inscricao.html
git commit -m "feat: descrição do que foi feito"
git push origin develop
```

Evitar `git add .`. Neste projecto o Windows pode marcar muitos ficheiros como alterados só por causa do fim de linha (CRLF/LF), sem terem mudado de verdade, e o `git add .` guardaria tudo isso no commit.

A `develop` não vai para o ar. Pode fazer push à vontade.

---

## Trabalhos maiores: branches de feature

Para uma funcionalidade maior (por exemplo, o painel de administração), criar uma branch a partir da `develop`:

```bash
git checkout develop
git pull origin develop
git checkout -b feature/nome-da-feature
```

Trabalhar e fazer commits na feature. Quando estiver pronta e testada:

```bash
git push origin feature/nome-da-feature
```

No GitHub: **Pull requests, New pull request**, com **Base: `develop`** e **Compare: `feature/nome-da-feature`**. Depois do merge, apagar a branch.

---

## Quando quero colocar no ar

Só fazer isto quando o trabalho estiver testado e aprovado pela equipa.

### Opção A - Via GitHub (recomendado)

1. Ir ao repositório `Fernando2300/Grupo-Conecta-Website`.
2. **Pull requests, New pull request**.
3. Configurar: **Base: `main`**, **Compare: `develop`**.
4. **Create pull request**.
5. Rever as alterações e clicar **Merge pull request**.
6. O GitHub Pages volta a publicar o site em cerca de 1 a 2 minutos.

### Opção B - Via terminal

```bash
git checkout main
git pull origin main
git merge develop
git push origin main
git checkout develop   # voltar imediatamente para develop
```

Depois do merge, voltar sempre para a `develop` para continuar a trabalhar.

---

## Corrigir um erro urgente em produção

Se aparecer um erro grave no site e for preciso corrigir já:

```bash
# Criar a branch de correcção a partir da main
git checkout main
git pull origin main
git checkout -b hotfix/descricao-do-erro

# Corrigir, testar e guardar
git add ficheiro-alterado.js
git commit -m "fix: descrição da correcção"
git push origin hotfix/descricao-do-erro

# Juntar à main (vai para o ar)
git checkout main
git merge hotfix/descricao-do-erro
git push origin main

# Juntar também à develop, para não perder a correcção
git checkout develop
git merge hotfix/descricao-do-erro
git push origin develop

# Apagar a branch de hotfix
git branch -d hotfix/descricao-do-erro
```

---

## Convenções de mensagens de commit

Usar sempre o formato `tipo: descrição`:

| Prefixo | Quando usar |
|---|---|
| `feat:` | Nova funcionalidade |
| `fix:` | Correcção de erro |
| `chore:` | Configurações e tarefas de manutenção |
| `docs:` | Documentação |
| `style:` | Ajustes visuais (CSS) |
| `refactor:` | Reorganização de código sem mudar o comportamento |

Exemplos:

```
feat: pagamento por Kwik e Transferência Express
fix: links internos com .html para funcionar no Live Server
style: ajustar espaçamento dos cartões de vídeo
docs: actualizar guia de fluxo Git
```

---

## Resumo visual

```
develop  ──●──●──●──────────────●──●──
                  \            /
                   merge → main ──●── (GitHub Pages publica sozinho)
```

---

## Checklist antes de fazer merge para a main

- [ ] Testei no Live Server, no computador e no telemóvel
- [ ] A consola do browser (F12) não mostra erros em nenhuma página
- [ ] Os links do menu e do rodapé funcionam em todas as páginas
- [ ] Em `data/site.json`, o workshop activo, o estado das inscrições (`abertas` ou `encerradas`) e o `valorMinimo` (0 = gratuito) estão certos
- [ ] Os dados de pagamento (números, IBAN, titular) foram confirmados com a tesouraria
- [ ] Se mudou algo no pagamento, fiz um teste real de 500 Kz
- [ ] Apaguei da folha de inscrições todas as linhas de teste ("TESTE")
- [ ] Não há `console.log` esquecidos nem blocos de código antigos com dados de outras pessoas
- [ ] Os dois membros da equipa estão de acordo

---

## Nota para o futuro painel de administração

O painel (Passo 9 do plano) vai gravar alterações em `data/site.json` através da API do GitHub. Isso é uma excepção à regra de não escrever na `main`, porque o site só se actualiza quando a `main` muda. Antes de construir o painel, decidir:

- se o painel grava na `main` apenas o ficheiro `data/site.json` (e a protecção da `main` tem de permitir essa excepção), ou
- se grava numa branch própria e alguém faz o merge.

Se o painel gravar na `main`, a `develop` fica atrasada. Nesse caso, antes de começar a trabalhar, trazer as alterações da `main`:

```bash
git checkout develop
git pull origin develop
git merge origin/main
```

---

Última actualização: Outubro de 2026