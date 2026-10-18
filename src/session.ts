import { db } from './db.ts'

export type Reviewer = { email: string }

export async function signIn(email: string, password: string): Promise<Reviewer> {
  const { data, error } = await db.auth.signInWithPassword({ email, password })
  if (error) {
    throw error
  }
  const signedIn = data.user?.email
  if (!signedIn) {
    throw new Error('sign-in returned no email')
  }
  return { email: signedIn }
}

export async function signOut(): Promise<void> {
  const { error } = await db.auth.signOut()
  if (error) {
    throw error
  }
}

export async function currentReviewer(): Promise<Reviewer | null> {
  const { data, error } = await db.auth.getSession()
  if (error) {
    throw error
  }
  const email = data.session?.user.email
  if (!email) {
    return null
  }
  return { email }
}
