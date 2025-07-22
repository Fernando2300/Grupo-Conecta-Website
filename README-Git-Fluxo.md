
# 🚀 Fluxo de Trabalho Git - Projeto Grupo Conecta

Este projeto é mantido por uma equipa de 2 pessoas. Para garantir organização, colaboração eficiente e evitar conflitos no código, usamos a seguinte metodologia com Git e GitHub.

---

## 🗂 Estrutura de Branches

- `main` → Contém apenas o código final e estável (produção).
- `dev` → Contém o código integrado, testado e pronto para ir para `main`.
- `feature/nome-da-feature` → Branches de desenvolvimento para novas funcionalidades.
- `fix/nome-do-bug` → Correções pontuais de bugs.

---

## 🧭 Fluxo de Trabalho

1. **Atualizar o repositório local**

```bash
git checkout degit pull origin dev
```

2. **Criar uma nova branch de funcionalidade**

```bash
git checkout -b feature/nome-da-feature
```

3. **Trabalhar na nova branch e fazer commits claros**

```bash
git add .
git commit -m "Descreve claramente o que foi feito"
```

4. **Atualizar a branch com as alterações recentes da `dev` antes de terminar**

```bash
git checkout dev
git pull origin dev
git checkout feature/nome-da-feature
git merge dev
```

5. **Fazer push da feature e abrir Pull Request para `dev`**

```bash
git push origin feature/nome-da-feature
```

Depois, no GitHub: Criar Pull Request → Comparar com `dev`

6. **Revisar e testar antes do merge**

- Todos devem revisar e testar o código da Pull Request antes de aceitar.
- Após aprovação, o merge é feito na branch `dev`.

7. **Merge de `dev` para `main`**

Só deve acontecer quando:
- Todas as funcionalidades estiverem prontas
- O projeto estiver testado
- Pronto para deploy ou publicação

---

## 💡 Convenção de nomes de branches

| Tipo          | Padrão                    | Exemplo                          |
|---------------|---------------------------|----------------------------------|
| Funcionalidade| `feature/nome`            | `feature/formulario-contacto`   |
| Bug fix       | `fix/nome`                | `fix/menu-mobile`               |
| Refatoração   | `refactor/nome`           | `refactor/validacao-form`       |

---

## ✅ Boas Práticas

- Nunca trabalhar direto na `main`
- Fazer `pull` antes de `push`
- Trabalhar em branches separadas
- Fazer commits frequentes e descritivos
- Comentar nas Pull Requests quando necessário
- Sempre testar antes de fazer merge

---

## 📁 .gitignore (exemplo)

```gitignore
node_modules/
.env
.DS_Store
*.log
```

---

## 📞 Comunicação

- Alinhar sempre antes de iniciar uma nova tarefa.
- Em caso de dúvida sobre o merge ou conflito, discutir antes de executar.
