import { createServer, request } from 'node:http'
import { spawn } from 'node:child_process'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Fake upstream: streams SSE chunks slowly, like a real LLM.
let upstreamMode = 'sse'
const upstream = createServer(async (req, res) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (upstreamMode === 'sse') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    for (let i = 0; i < 5; i++) {
      res.write(`data: {"type":"chunk","i":${i}}\n\n`)
      await sleep(220)
    }
    res.end('data: [DONE]\n\n')
  } else if (upstreamMode === 'die') {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: {"i":0}\n\n')
    await sleep(150)
    res.socket.destroy()          // upstream dies mid-response
  } else {
    res.writeHead(200, {'content-type':'application/json'}); res.end('{"ok":true}')
  }
})
await new Promise(r => upstream.listen(0, '127.0.0.1', r))
const UP = upstream.address().port

const proxy = spawn(process.execPath, ['packages/cli/dist/cli.js','proxy','--port','8899','--mode','redact','--upstream',`http://127.0.0.1:${UP}`], { stdio:['ignore','ignore','pipe'] })
let proxyErr = ''
proxy.stderr.on('data', d => { proxyErr += d.toString() })
await sleep(1200)

function post(path, body, opts={}) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const arrivals = []
    const req = request({ host:'127.0.0.1', port:8899, path, method:'POST',
      headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)} },
      (res) => {
        res.on('data', () => arrivals.push(Date.now()-t0))
        res.on('end', () => resolve({ ok:true, status:res.statusCode, arrivals, total:Date.now()-t0 }))
      })
    req.on('error', (e) => resolve({ ok:false, error:e.code || e.message, arrivals, total:Date.now()-t0 }))
    req.write(body)
    if (opts.abortAfter != null) setTimeout(() => req.destroy(), opts.abortAfter)
    else req.end()
  })
}
const BODY = JSON.stringify({ model:'x', stream:true, messages:[{role:'user',content:'hello world'}] })

console.log('=== 1. streaming SSE: i chunk arrivano progressivamente? ===')
upstreamMode='sse'
const r1 = await post('/v1/messages', BODY)
console.log(`  status ${r1.status}, ${r1.arrivals.length} chunk, ms di arrivo: [${r1.arrivals.join(', ')}], totale ${r1.total}ms`)
console.log(`  ${r1.arrivals.length>1 && r1.arrivals[0] < r1.total/2 ? 'STREAMING OK' : 'NON STREAMA: tutto insieme alla fine'}`)

console.log('\n=== 2. client che stacca a meta richiesta ===')
const r2 = await post('/v1/messages', BODY, { abortAfter: 60 })
await sleep(700)
console.log(`  client: ${r2.ok ? 'ok' : 'errore '+r2.error}`)
console.log(`  proxy vivo: ${proxy.exitCode === null}`)

console.log('\n=== 3. upstream che muore a meta risposta ===')
upstreamMode='die'
const r3 = await post('/v1/messages', BODY)
await sleep(500)
console.log(`  client: ${r3.ok ? 'status '+r3.status+', '+r3.arrivals.length+' chunk' : 'errore '+r3.error}`)
console.log(`  proxy vivo: ${proxy.exitCode === null}`)

console.log('\n=== 4. 50 richieste concorrenti ===')
upstreamMode='json'
const t0=Date.now()
const many = await Promise.all(Array.from({length:50},()=>post('/v1/messages', BODY)))
console.log(`  ok: ${many.filter(m=>m.ok&&m.status===200).length}/50 in ${Date.now()-t0}ms`)
console.log(`  proxy vivo: ${proxy.exitCode === null}`)

console.log('\n=== stderr del proxy (errori non gestiti) ===')
const noise = proxyErr.split('\n').filter(l => l && !/^contextia proxy:|^point your agent|^live stats/.test(l))
console.log(noise.length ? noise.slice(0,8).join('\n') : '  (nessuno)')

proxy.kill(); upstream.close()
