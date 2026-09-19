# Checklist Luma: produto, precos e preparacao comercial

Pesquisa revisada em 16/09/2026. Valores sao referencias publicas, sujeitos a alteracao; nao representam propostas comerciais negociadas.

## Recomendacao executiva

Manter R$ 9,90 no individual como preco de lancamento e testar R$ 49,90 por empresa, com titular e cinco colaboradores. R$ 15,90 por empresa pode funcionar como piloto promocional, mas precisa de prazo e acompanhamento de custos. Esta e uma hipotese comercial, nao uma garantia de margem ou conversao.

Os valores configurados no aplicativo continuam sendo os sugeridos pelo proprietario: R$ 9,90 e R$ 15,90. Nenhum reajuste foi aplicado automaticamente.

## Referencias de mercado

| Produto | Preco publicado | Comparabilidade |
| --- | --- | --- |
| Checkmob Starter | R$ 49 por usuario/mes; minimo de cinco licencas. Referencia de R$ 245/mes no mensal. R$ 41 por usuario/mes no anual. | Gestao de equipe de campo, tarefas e formularios; operacao e suporte mais amplos. |
| Zellus | R$ 199/mes para ate cinco usuarios e cinco tipos de checklist; usuario adicional R$ 19,99. | Checklist empresarial com alertas, laudos e indicadores. Limite de tipos de checklist nao e limite de preenchimentos. |
| Hauseful Start | A pagina apresenta R$ 149,90 e R$ 129,90/mes para um usuario. | Produto especializado em vistorias; conferir condicao promocional e periodicidade no checkout. |
| Hauseful Gold | A pagina apresenta R$ 999,50 e R$ 799,50/mes para ate cinco usuarios. | Inclui recursos de campo, relatorios e integracoes que nao devem ser tratados como equivalentes ao Luma atual. |

Fontes: [Checkmob](https://www.checkmob.com/precos), [Zellus](https://www.zellusapp.com/planos), [Hauseful](https://hauseful.com/checklist/planos/).

Nao usar apenas esses precos para concluir que o Luma deve cobrar o mesmo. Sao referencias de posicionamento, com maturidade, suporte e escopo diferentes. O diferencial inicial proposto e simplicidade para pessoas e pequenas equipes, nao equivalencia a suites corporativas.

## Impacto das tarifas

Como cenario ilustrativo, a tabela publica do Asaas apresenta Pix a R$ 1,99 por recebimento e cartao a R$ 0,49 + 2,99%, com condicoes promocionais temporarias. As tarifas do contrato e a elegibilidade do Pix Automatico precisam ser confirmadas na conta. Fonte: [precos e taxas Asaas](https://www.asaas.com/precos-e-taxas).

| Mensalidade | Apos tarifa ilustrativa de cartao | Apos tarifa ilustrativa de Pix |
| --- | --- | --- |
| R$ 9,90 | R$ 9,11 | R$ 7,91 |
| R$ 15,90 | R$ 14,93 | R$ 13,91 |
| R$ 49,90 | R$ 47,92 | R$ 47,91 |

Calculo: cartao = preco - 0,49 - preco * 0,0299; Pix = preco - 1,99. Esses valores NAO sao lucro: faltam impostos, infraestrutura, armazenamento de fotos/audio, suporte, aquisicao, inadimplencia, eventuais notificacoes tarifadas e reembolsos.

A R$ 15,90 por seis acessos, a receita bruta por acesso e R$ 2,65. Isso deixa pouco espaco para suporte humano e uso intensivo de midia. Preenchimentos ilimitados tambem nao significam custo de armazenamento ilimitado.

## Como validar os precos

1. Oferecer o individual a R$ 9,90 em uma primeira turma e medir retencao, uso e pedidos de ajuda.
2. Testar o empresarial a R$ 49,90 com pequenas equipes, sem alterar o preco de quem ja contratou sem comunicacao e aceite aplicavel.
3. Registrar conversao apos escolher o plano, conclusao do pagamento, cancelamentos, custo de suporte e armazenamento por conta.
4. Comparar contribuicao por conta, nao apenas quantidade de cadastros. Exemplo: contribuicao = receita recebida - tarifas - custos variaveis.
5. So definir desconto anual apos conhecer o custo e a retencao. O sistema atual vende assinatura mensal.

## Direcao de design

O principio central e mostrar primeiro a acao frequente e deixar configuracoes secundarias acessiveis sob demanda. A pesquisa de divulgacao progressiva sustenta esse desenho; o fluxo de cadastro em etapas e uma aplicacao relacionada. Fonte: [Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/).

Aplicacao no Luma:

- Inicio centrado nas tarefas pendentes do dia, sem estatisticas administrativas ou botoes duplicados.
- Cabecalho mobile com altura estavel de 64 px; duas acoes flutuantes para tarefa e checklist.
- Criacao de tarefa com nome, data, horario, responsavel e notificacao; checklist vinculado e recorrencia ficam em secao expansivel.
- ADM dividido por tema; conteudos operacionais e cobrancas nao competem com a lista de acessos.
- Preto, branco e cinza como base; cores de erro e sucesso permanecem funcionais, nao decorativas.
- Estado vazio, formulario e listas usam a mesma hierarquia de texto; tipografia nao cresce proporcionalmente a largura da tela.

Criterios de verificacao: sem rolagem horizontal em 390 px; campos com rotulos associados; foco visivel por teclado; acoes principais com area de toque confortavel. A WCAG 2.2 especifica minimo de 24 por 24 CSS px, com excecoes; a meta do produto para acoes principais e 44 px ou mais. Fontes: [tamanho de alvo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) e [contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Isso nao substitui uma auditoria completa de acessibilidade.

## Regras comerciais implementadas

| Acesso | Gratuito | Pago |
| --- | --- | --- |
| Individual | Um usuario; tres preenchimentos/dia; modelos proprios; tarefas | Um usuario; preenchimentos ilimitados; comunidade; tarefas |
| Empresa | Titular + dois colaboradores; dois preenchimentos/dia por acesso; sem comunidade | Titular + cinco colaboradores; preenchimentos ilimitados; comunidade |

A cota usa o dia em America/Sao_Paulo e um registro separado dos preenchimentos. Excluir um preenchimento nao devolve cota. Na reducao do plano, as vagas excedentes ficam suspensas sem exclusao de dados; permanecem os dois colaboradores mais antigos, ordenados por criacao e ID em caso de empate.

## Pagamentos e limites desta entrega

Cartao usa a fatura hospedada pelo Asaas. Pix Automatico utiliza autorizacao e `paymentCreationMode: SUBSCRIPTION`. O QR inicial deve enviar `originalValue` e `expirationSeconds`; a resposta traz `payload`, `encodedImage` e pode trazer `subscriptionId`. Fonte: [referencia da autorizacao](https://docs.asaas.com/reference/criar-uma-autorizacao-pix-automatico).

Criar fatura ou QR nao libera o plano. Eventos autenticados sao reconciliados com o recurso atual da API; eventos duplicados nao devem estender duas vezes o mesmo periodo. Cancelar recorrencia preserva o periodo pago; estorno/chargeback do periodo atual retira o direito pago. Fontes: [fluxos de webhook](https://docs.asaas.com/docs/fluxos-de-webhook) e [consulta de cobranca](https://docs.asaas.com/reference/recuperar-uma-unica-cobranca).

O recebimento de Pix Automatico depende de conta PJ aprovada e elegivel, incluindo os criterios cadastrais do provedor. Isso diz respeito a conta recebedora do Luma, nao a obrigatoriedade de todos os clientes serem empresas. Fonte: [FAQ Asaas](https://docs.asaas.com/docs/faq-2).

## Antes de vender

- Configurar e testar PostgreSQL separado de producao. As migracoes e os locks PostgreSQL ainda nao foram executados contra um banco real nesta entrega.
- Homologar no Asaas Sandbox: cartao, Pix inicial, renovacao, falha, estorno, cancelamento, replay e eventos fora de ordem. O usuario confirmou que banco de testes e Sandbox ainda nao estao configurados.
- Confirmar o vinculo do primeiro pagamento Pix e dos pagamentos futuros com a autorizacao/assinatura real. Os testes locais usam simulacao, nao certificam o comportamento do provedor.
- Completar recuperacao de operacoes interrompidas entre criacao no Asaas e persistencia local, historico de assinaturas substituidas e conciliacao de eventos sem vinculo. Nao anunciar tolerancia completa a falhas financeiras antes disso.
- Homologar exclusao de titular com assinatura e colaboradores: nao remover dados de cobranca nem deixar recorrencias ativas sem titular.
- Implementar push com agendamento no servidor para lembretes com app fechado. Hoje as notificacoes dependem do aplicativo ativo; o formulario informa essa limitacao.
- Implementar recuperacao de senha, verificacao real de email, limitacao de tentativas de login, backups e monitoramento antes da abertura publica.
- Revisar termos do proprio Luma, privacidade, cancelamento, suporte e tratamento de evidencias. A politica do Asaas nao substitui os termos do produto.
- Substituir a gravacao integral das tabelas operacionais por gravacao incremental antes de escalar; a protecao de revisao impede sobrescrita silenciosa, mas nao elimina o custo dessa arquitetura.

Conclusao: a versao local esta mais organizada e com restricoes reforcadas. Ainda nao e uma declaracao de prontidao para cobrancas reais.
