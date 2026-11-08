import { login, signup } from './actions'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; info?: string }> }) {
  const { error, info } = await searchParams
  return (
    <main className="narrow">
      <h1 className="display">Mi estilista</h1>
      <div className="tape" />
      <form className="stack">
        {error && <p className="msg bad">{error}</p>}
        {info && <p className="msg">{info}</p>}
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Contraseña<input name="password" type="password" required minLength={8} autoComplete="current-password" /></label>
        <div className="btns">
          <button className="btn primary" formAction={login}>Entrar</button>
          <button className="btn" formAction={signup}>Crear cuenta</button>
        </div>
      </form>
    </main>
  )
}
