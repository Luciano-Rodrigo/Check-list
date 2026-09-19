# Publicacao na Railway pelo GitHub

## 1. Repositorio e testes

Envie o projeto para um repositorio GitHub, preferencialmente privado. Inclua `package-lock.json`, `railway.json` e `.github/workflows/test.yml`. Nao envie `.env`, chaves, senhas, backups ou `node_modules`.

O workflow `Tests` roda em Node.js 22 e executa a suite em memoria e em PostgreSQL 16 descartavel. As cobrancas sao simuladas; o workflow nao precisa de segredos da Railway ou do Asaas. Aguarde os dois passos passarem antes de publicar. Na Railway, habilite a opcao de aguardar o CI, se disponivel para o servico.

## 2. Servicos Railway

1. Crie ou abra o projeto Railway e adicione PostgreSQL, mantendo o volume persistente.
2. Adicione um servico conectado ao repositorio GitHub e selecione a branch que sera publicada.
3. Use a raiz do repositorio. Frontend e API ficam no mesmo servico; nao e necessario um segundo deploy de frontend.
4. O arquivo `railway.json` configura Railpack, `node server.js` e `/api/health`. Nao e necessario comando de build de frontend ou executar `database.sql` manualmente.
5. Configure as variaveis abaixo no **servico web**, nao apenas no PostgreSQL.
6. Gere o dominio HTTPS em Settings > Networking ou conecte seu dominio proprio. Mantenha inicialmente uma replica e a mesma regiao do banco.

## 3. Variaveis do servico web

| Nome | Valor / finalidade |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Referencia ao banco: `${{Postgres.DATABASE_URL}}`. Troque `Postgres` pelo nome exato do servico PostgreSQL. Use a referencia pela rede privada. |
| `PGSSLMODE` | `require` para o PostgreSQL com SSL da Railway. |
| `ADMIN_PASSWORD` | Senha administrativa exclusiva, aleatoria, com pelo menos 12 caracteres; recomendado 20 ou mais. |
| `ASAAS_ENV` | `sandbox` na homologacao; `production` somente para cobrancas reais. |
| `ASAAS_API_KEY` | Chave completa da API do Asaas, correspondente ao ambiente escolhido. |
| `ASAAS_WEBHOOK_TOKEN` | Segredo aleatorio de pelo menos 32 caracteres. Configure exatamente o mesmo no webhook Asaas. Nao e a chave da API. |
| `PLAN_PERSONAL_PRICE` | `9.90`, mensal em reais. |
| `PLAN_COMPANY_PRICE` | `15.90`, mensal em reais. |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | `30`, para aguardar requisicoes em andamento e encerrar conexoes antes de parar. |

Nao fixe `PORT`: o servidor utiliza o valor fornecido pela Railway. Nao configure `ASAAS_TEST_BASE_URL`, `TEST_DATABASE_URL` nem `NODE_ENV=test` em producao.

Cole a chave Asaas inteira no valor de `ASAAS_API_KEY`, preservando o `$` inicial quando presente, sem adicionar aspas no campo individual da Railway. Uma chave sandbox nao serve em producao. Nao coloque a chave em `app.js`, HTML ou variaveis publicas de frontend.

Para gerar o token do webhook localmente, pode usar `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Guarde o resultado como segredo apenas na Railway e no Asaas; nao o envie em conversas ou commits.

Sem `ASAAS_API_KEY`, o plano gratuito funciona e tentativas de contratar um plano retornam indisponibilidade. Com a chave definida em producao, ambiente e token forte passam a ser obrigatorios.

`PGSSLMODE=require` usa TLS sem validar a cadeia do certificado, para compatibilidade com o certificado do template Railway. Para infraestrutura com certificado confiavel, `verify-full` exige validacao. `disable` e destinado a PostgreSQL local de testes sem TLS; nao use para resolver erros de certificado em conexoes publicas.

## 4. Primeiro inicio e dados existentes

O servidor conecta ao banco, cria/atualiza as tabelas e prepara o administrador antes de aceitar trafego. Falhas de conexao ou permissao impedem o deploy de ficar saudavel. O usuario PostgreSQL precisa de permissoes para criar/alterar tabelas, indices e gravar dados.

O login administrativo inicial e `admin@luma.com`, com a senha definida em `ADMIN_PASSWORD`. Se ja existe um banco antigo, seus usuarios sao preservados e o email administrativo existente continua valendo. A senha da variavel prevalece no login administrativo.

A importacao da antiga tabela `app_state` so ocorre quando ainda nao ha usuarios nas tabelas normalizadas. Faca backup antes da primeira atualizacao sobre um banco existente. Dados que foram criados no modo local em memoria nao sao transferidos automaticamente para a Railway.

Abra `https://SEU_DOMINIO/api/health`: o esperado e HTTP 200 com `ok: true`, `database: true` e `storage: "postgresql-normalized"`. Um HTTP 503 indica indisponibilidade do banco ou encerramento do servidor. O healthcheck nao valida a chave Asaas nem monitora pagamentos.

## 5. Webhook Asaas

No painel do **mesmo ambiente** da chave, configure:

- URL: `https://SEU_DOMINIO/api/asaas/webhook`
- Token de autenticacao: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`.
- Webhook habilitado; entrega sequencial recomendada.

Eventos tratados pelo sistema:

```text
PAYMENT_CONFIRMED
PAYMENT_RECEIVED
PAYMENT_REFUNDED
PAYMENT_CHARGEBACK_REQUESTED
PAYMENT_CHARGEBACK_DISPUTE
PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED
PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED
PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED
PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED
PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CREATED
```

O Asaas envia esse token no cabecalho `asaas-access-token`; ele e diferente do cabecalho `access_token` usado pelo backend para chamar a API. Nao ha necessidade de compartilhar a chave com o navegador. O cartao e informado na fatura hospedada pelo Asaas.

O Pix integrado e **Pix Automatico**, sujeito a habilitacao/elegibilidade da conta Asaas. Nao prometa recorrencia Pix antes de homologar a autorizacao inicial e as cobrancas seguintes.

## 6. Checklist antes de vender

- Confirmar que o workflow GitHub passou, inclusive PostgreSQL e persistencia apos reinicio.
- Criar contas de teste individuais e empresariais; conferir limites e isolamento entre empresas.
- Criar tarefa, modelo e preenchimento, reiniciar o servico e verificar que continuam salvos.
- Homologar cartao e Pix Automatico em Asaas Sandbox: pendencia, confirmacao, evento repetido, cancelamento e estorno. Verificar os eventos no Asaas e o plano no ADM.
- Usar ambiente/banco separados para homologacao. Para vender, trocar pela chave de producao, `ASAAS_ENV=production` e configurar o webhook no painel de producao; nao reutilizar cadastros de cobranca sandbox no banco definitivo.
- Habilitar backups recorrentes do volume PostgreSQL e testar restauracao. Rollback de codigo nao restaura dados.
- Monitorar erros, disponibilidade, armazenamento e fila de webhooks; os healthchecks de deploy nao substituem monitoramento continuo.
- Publicar/revisar politica de privacidade, termos e suporte; revisar protecoes contra abuso e limites de trafego antes de divulgacao ampla.

Limites atuais: notificacoes so funcionam enquanto o aplicativo esta ativo; fotos/audio ficam no PostgreSQL junto dos registros, portanto acompanhe volume, tamanho das requisicoes e latencia. Antes de grande escala, planeje armazenamento de midia separado e testes de carga. Recuperacao de senha por email ainda precisa de um fluxo dedicado.

## 7. Diagnostico rapido

| Sintoma | Verificar |
| --- | --- |
| Deploy nao inicia | `NODE_ENV`, `DATABASE_URL`, `ADMIN_PASSWORD`, permissao do banco e logs de inicializacao. |
| Erro SSL | Template PostgreSQL e `PGSSLMODE`; nao desabilite TLS numa conexao publica. |
| Healthcheck falha | Banco acessivel pela rede privada, dominio da referencia e porta fornecida pela Railway. |
| Login nao permanece | Usar HTTPS; cookies de sessao sao `Secure` em producao. |
| Asaas 401 | Chave completa, sem aspas extras, ambiente correto e chave habilitada. |
| Webhook 401 | Mesmo `ASAAS_WEBHOOK_TOKEN` nos dois lados. |
| Pagamento confirmado sem liberar | Eventos habilitados, URL correta, fila de entrega no Asaas e plano/cliente/valor correspondentes. |

## Referencias oficiais

- [Deploy Express na Railway](https://docs.railway.com/guides/express)
- [PostgreSQL na Railway](https://docs.railway.com/databases/postgresql)
- [Healthchecks](https://docs.railway.com/deployments/healthchecks)
- [Config as Code](https://docs.railway.com/config-as-code)
- [Encerramento de deploys](https://docs.railway.com/deployments/deployment-teardown)
- [Autenticacao Asaas](https://docs.asaas.com/docs/authentication)
- [Webhooks Asaas](https://docs.asaas.com/docs/about-webhooks)
