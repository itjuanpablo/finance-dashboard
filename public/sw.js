// Service worker do Fluxo — offline SOMENTE LEITURA.
//
// O problema que ele resolve: o app tem manifest, ícone e `display: standalone`,
// então o iPhone deixa colocá-lo na tela de início e ele abre em tela cheia como
// aplicativo. Mas os dados vêm do servidor rodando no Mac. Quando o Mac está
// desligado, ou o Tailscale caiu, o "aplicativo" abria uma TELA BRANCA — a pior
// resposta possível, porque não diz se o problema é a rede, o app ou os dados.
//
// O que este arquivo faz: guarda a casca do app e a ÚLTIMA resposta de cada API.
// Sem conexão, a pessoa abre e vê os números da última vez que abriu, com uma
// tarja dizendo de quando são.
//
// O QUE ELE NÃO FAZ, DE PROPÓSITO
//
// Não guarda escrita para enviar depois. Lançar um gasto offline e sincronizar
// exigiria resolver conflito — o que fazer se o mesmo lançamento foi importado
// no servidor enquanto você o digitava no celular? Em dado financeiro, um
// conflito mal resolvido vira lançamento duplicado ou perdido, e o usuário só
// descobre no fim do mês. Enquanto não houver uma resposta boa para isso, POST,
// PUT, PATCH e DELETE simplesmente falham offline, e a tela avisa.
//
// Estratégias:
//   · navegação e recursos estáticos → cache primeiro, rede atualiza depois
//     (stale-while-revalidate): abre instantâneo e se atualiza sozinho.
//   · GET de /api/*                  → rede primeiro, cache como rede de
//     segurança: dado financeiro tem de ser o mais novo possível; o cache só
//     entra quando não há alternativa.
//   · escrita em /api/*              → só rede. Falhou, falhou.

const VERSION = 'fluxo-v1';
const CASCA = `${VERSION}-casca`;
const DADOS = `${VERSION}-dados`;

// Mínimo para a tela montar. O resto (chunks JS do Next, com hash no nome)
// entra no cache conforme é pedido — listar aqui quebraria a cada build.
const ESSENCIAIS = ['/', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CASCA)
      // `catch` por recurso: se um deles falhar (404, servidor reiniciando), a
      // instalação inteira não pode ir junto — senão o app fica sem offline
      // nenhum por causa de um ícone.
      .then((c) => Promise.allSettled(ESSENCIAIS.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(
        ks.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Só mexe no que é deste servidor.
  if (url.origin !== self.location.origin) return;

  // ── escrita: nunca sai do ar silenciosamente ──────────────────────────────
  if (request.method !== 'GET') {
    e.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ error: 'offline', offline: true }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )),
    );
    return;
  }

  // ── GET de API: rede primeiro, cache como último recurso ──────────────────
  if (url.pathname.startsWith('/api/')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(request);
        if (res.ok) {
          const c = await caches.open(DADOS);
          // Carimba QUANDO o dado foi obtido: é o que permite à tela dizer
          // "dados de hoje às 14h" em vez de fingir que está tudo atual.
          const corpo = await res.clone().blob();
          const headers = new Headers(res.headers);
          headers.set('X-Fluxo-Cached-At', new Date().toISOString());
          c.put(request, new Response(corpo, { status: res.status, headers }));
        }
        return res;
      } catch {
        const cached = await caches.match(request);
        if (cached) {
          // Marca a resposta como vinda do cache para o app mostrar a tarja.
          const headers = new Headers(cached.headers);
          headers.set('X-Fluxo-Offline', '1');
          return new Response(await cached.blob(), { status: 200, headers });
        }
        return new Response(
          JSON.stringify({ error: 'offline', offline: true }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        );
      }
    })());
    return;
  }

  // ── navegação e estáticos: cache primeiro, rede atualiza por trás ─────────
  e.respondWith((async () => {
    const cached = await caches.match(request);
    const rede = fetch(request).then(async (res) => {
      if (res.ok) (await caches.open(CASCA)).put(request, res.clone());
      return res;
    }).catch(() => null);

    if (cached) return cached;
    const res = await rede;
    if (res) return res;

    // Navegação sem cache e sem rede: devolve a raiz, que costuma estar em
    // cache. Sem isto, o iPhone mostra a página de dinossauro dentro do app.
    if (request.mode === 'navigate') {
      const raiz = await caches.match('/');
      if (raiz) return raiz;
    }
    return new Response('', { status: 504 });
  })());
});
