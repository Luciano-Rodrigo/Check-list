# Check list profissional

Produto Luma para criar modelos de checklist, preencher evidências, registrar localização, assinaturas, checklists preenchidos e tarefas.

## Como abrir

Abra `index.html` diretamente no navegador para testar a maior parte do sistema com fallback local.

Para testar com o backend Node, API e fallback de banco:

```powershell
cd "C:\Users\luref\OneDrive\Desktop\Projetos\Check list profissional"
npm install
npm start
```

Depois acesse:

```text
http://127.0.0.1:5173
```

Sem `DATABASE_URL`, o servidor responde a API usando estado inicial em memória e o navegador mantém fallback em `localStorage`.

## Acesso demo

```text
Email: admin@luma.com
Senha: admin123
```

## O que esta versão entrega

- Login e cadastro com verificação de email simulada.
- Papéis ADM, Empresa, Agente e Pessoal.
- Criação de modelos públicos ou privados.
- Categoria e cor visual para os modelos.
- Distribuição de modelos para agentes da empresa.
- Cinco modelos públicos iniciais: veículo, ambiente corporativo, entrega técnica, segurança operacional e estoque.
- Campos configuráveis com aprovação/reprovação, observação, foto, áudio, transcrição, localização e assinatura.
- Tópicos de checklist em cartões compactos, com ações por ícones.
- Fotos múltiplas por tópico, com miniaturas e remoção individual.
- Observações em modal, exibidas dentro do tópico após salvar.
- Áudio com player e transcrição vinculados ao tópico.
- Captura automática de localização ao selecionar o resultado do checklist, assinar ou concluir tarefa.
- Múltiplas assinaturas no mesmo checklist.
- Preenchimento de checklist com registro final editável.
- Edição e exclusão de checklists já preenchidos.
- Geração de PDF via impressão do navegador.
- Tarefas simples e recorrentes com janela de funcionamento e modelo de checklist vinculado.
- Notificações enquanto o app estiver aberto.
- Botão flutuante para preencher checklist rapidamente.
- Opções avançadas de arte para modelos: cor, categoria, cabeçalho e borda.
- Tema claro e escuro.
- Persistência em PostgreSQL quando executado pelo backend Node.
- Fallback local via `localStorage` quando aberto sem API.

## Deploy na Railway

1. Crie um projeto na Railway.
2. Adicione um serviço PostgreSQL.
3. Adicione este repositório como serviço Node.
4. Garanta que a variável `DATABASE_URL` do PostgreSQL esteja disponível no serviço web.
5. O comando de start já está em `railway.json` e `package.json`: `npm start`.

O backend cria automaticamente a tabela `app_state`:

```sql
create table if not exists app_state (
  key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
```

## Observação técnica

Nesta versão, o PostgreSQL persiste o estado completo da aplicação em JSONB. É uma boa ponte para deploy inicial. A evolução natural é normalizar o banco em tabelas separadas para usuários, modelos, preenchimentos, tarefas e anexos.
