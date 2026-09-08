import { useState } from 'react'
import { supabase } from '../supabase'

type AuthProps = {
  onLogin: () => void
}

function Auth({ onLogin }: AuthProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const signUp = async () => {
    if (!email || !password) {
  alert('メールアドレスとパスワードを入力してね')
  return
}
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      alert(error.message)
      return
    }

    alert('登録できたよ。メールを確認してね')
  }

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(error.message)
      return
    }

    onLogin()
    alert('ログインできたよ')
  }

  return (
  <div className="auth-form">
    <input
      type="email"
      placeholder="メールアドレス"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
    />

    <input
      type="password"
      placeholder="パスワード"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
    />

    <div className="auth-actions">
      <button onClick={signIn}>ログイン</button>
      <button onClick={signUp}>新規登録</button>
    </div>
  </div>
)
}

export default Auth