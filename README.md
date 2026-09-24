# Check list profissional

Produto Luma para criar modelos de checklist, preencher evidências, registrar localização, assinaturas, checklists preenchidos e tarefas.

## Como abrir

O cadastro, login e as regras de plano dependem do backend Node:

```powershell
cd "C:\Users\luref\OneDrive\Desktop\Projetos\Check list profissional"
npm install
npm start
```

Depois acesse:

```text
http://127.0.0.1:5173
```

Sem `DATABASE_URL`, o backend usa memória apenas para desenvolvimento; dados somem ao reiniciar. Para produção, configure PostgreSQL.

Para regenerar os ícones PWA a partir da logo SVG:

```powershell
npm run icons
```

## Acesso administrativo local

```text
Email: admin@luma.com
Senha: admin123 (apenas no ambiente local; defina `ADMIN_PASSWORD` antes de publicar)
```

## O que esta versão entrega

- Login por sessão no servidor e senha armazenada como hash scrypt.
- Cadastro em três etapas: individual ou empresa, informações e escolha do plano.
- Individual gratuito: 3 preenchimentos por dia, modelos próprios e tarefas; individual pago: preenchimentos ilimitados e comunidade.
- Empresa gratuita: 2 preenchimentos por dia por acesso e até 2 colaboradores. Empresa paga: R$ 34,90/mês pelo titular + 2 colaboradores, com preenchimentos ilimitados; cada colaborador adicional custa R$ 4,90/mês.
- Cotas diárias em America/Sao_Paulo, preservadas mesmo ao excluir preenchimentos; controle de revisão evita sobrescrita silenciosa entre dispositivos.
- No retorno ao gratuito, colaboradores excedentes ficam suspensos sem apagar dados; os dois mais antigos mantêm acesso.
- Conta paga é ativada após confirmação do Asaas por webhook autenticado. A confirmação mensal mantém o plano ativo; uma mensalidade vencida rebaixa o acesso para o gratuito até uma nova confirmação. Cartão usa a Fatura Asaas; Pix Automático depende da elegibilidade da conta Asaas.
- Papéis ADM, Empresa, Agente e Pessoal.
- Criação de modelos públicos ou privados.
- Abas separadas para modelos privados e da comunidade, com busca por palavra-chave.
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
- Botões rápidos para tarefa e preenchimento de checklist.
- Opções avançadas de arte para modelos: cor, categoria, cabeçalho e borda.
- Fundos A4 prontos em estilos pastel, com miniaturas para escolha no modelo e aplicação no PDF.
- Campo de imagem interativa: envio de planta/desenho, bolinhas arrastáveis para pontos de avaliação e marcação no preenchimento.
- Fotos de evidência ficam vinculadas ao item no PDF, em tamanho reduzido, com data/hora, localização, IP disponível e identificação do navegador.
- Meu perfil para todos os acessos, com troca de senha; titulares podem cancelar no modal com motivo e encerrar a recorrência.
- Tema claro e escuro.
- PWA instalável com manifesto, service worker, ícone Luma, favicon e Apple touch icon.
- Botão de instalação na tela de login.
- Layout mobile com barra superior compacta e menu suspenso pelos três traços.
- Persistência em PostgreSQL normalizado quando executado pelo backend Node.
- Tabelas separadas para acessos, workspaces, modelos, permissões de agentes, checklists preenchidos e tarefas.
- Cada cadastro de Empresa ou Pessoal cria seu próprio workspace zerado no banco.
- Agentes ficam isolados dentro do workspace da empresa que os criou.
- O ADM consegue ler todos os workspaces.
- API de estado exige sessão e limita os registros visíveis à empresa ou pessoa autenticada.

## Deploy na Railway

Passo a passo completo, variáveis, webhook e checklist de publicação: [DEPLOY-RAILWAY.md](DEPLOY-RAILWAY.md).

- Runtime configurado: Node.js 22, build Railpack e início direto com `node server.js`.
- Healthcheck: `/api/health`, com consulta real ao PostgreSQL.
- As tabelas e a migração inicial são executadas em transação antes de abrir a porta HTTP. Uma trava no banco serializa inicializações concorrentes.
- Em produção, banco e senha administrativa forte são obrigatórios; cobranças configuradas também exigem ambiente Asaas explícito e token de webhook com pelo menos 32 caracteres.
- A chave da API deve ficar em **`ASAAS_API_KEY`**, nas variáveis do serviço web, nunca no frontend ou no GitHub.
- O administrador pode liberar ou revogar o plano pago de acessos individuais e empresas sem gerar cobrança. Essa ação só é aceita pela API para o papel ADM.

O plano gratuito não precisa do Asaas. Cartão é preenchido na página hospedada pelo Asaas, sem dados de cartão passarem pelo aplicativo. Pix Automático requer conta Asaas elegível e autorização do pagador. O webhook libera o acesso após confirmação; abrir a fatura ou gerar o QR Code não ativa o plano.

Para validar os limites e o webhook com Asaas simulado:

```powershell
npm test
```

O backend cria automaticamente as tabelas principais:

```sql
access_workspaces
app_users
checklist_models
checklist_model_assignments
checklist_submissions
daily_tasks
app_sessions
plan_billing
asaas_webhook_events
checklist_usage
```

## Observação técnica

Pesquisa de preços, decisões de interface e pendências de lançamento: [PESQUISA-PRODUTO.md](PESQUISA-PRODUTO.md).

Por padrão, os testes usam memória e Asaas simulado, isolados de `DATABASE_URL`. Quando `TEST_DATABASE_URL` aponta para um banco exclusivo de testes, a mesma suíte roda com PostgreSQL em um schema temporário e valida persistência após reinício. O workflow do GitHub executa ambos os modos com um PostgreSQL descartável, sem chaves reais. Não substitui a homologação com Asaas Sandbox. Não houve cobrança real nesta entrega.

O banco agora usa tabelas separadas por tipo de cadastro e todas as tabelas operacionais possuem `workspace_id`. Isso entrega isolamento por acesso sem criar nomes dinâmicos de tabela por usuário, que é mais seguro e mais fácil de manter no PostgreSQL. A tabela antiga `app_state` ainda é criada apenas para migração automática de dados antigos, caso já exista um deploy anterior.
