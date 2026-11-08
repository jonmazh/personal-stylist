import { getUser } from '@/lib/supabase/server'
import { loadBundle } from '@/lib/profile/data'
import { buildContext } from '@/lib/ai/context'
import { configError, MODEL_CHAT, PROVIDER_LABEL } from '@/lib/ai/client'
import { ChatBox } from './chat-box'

export default async function StylistPage() {
  const user = (await getUser())!
  const ctx = buildContext(await loadBundle(user.supabase, user.id))
  const cfg = configError()
  return (
    <main>
      <p className="eyebrow">Consulta privada</p>
      <h1 className="display">Tu estilista</h1>
      <p className="lead">
        {ctx.hasValidated ? 'Respondo a partir de lo que has validado y de tu armario real.' : 'Todavía no has validado nada: trabajaré con hipótesis y te lo diré.'}
      </p>
      {cfg && <p className="note">{cfg}</p>}
      <ChatBox />
      <p className="m small" style={{ marginTop: 40 }}>IA: {PROVIDER_LABEL()} · {MODEL_CHAT()}</p>
    </main>
  )
}
