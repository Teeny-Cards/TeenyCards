import { deleteCardsByDeckId } from '@/services/card-service'
import { supabase } from '@/supabase-client'
import { useMemberStore } from '@/stores/member'
import Logger from '@/utils/logger'
import { DateTime } from 'luxon'

export async function createDeck(deck: Deck): Promise<any> {
  const { ...data } = deck

  const { error } = await supabase.from('decks').insert(data)

  if (error) {
    Logger.error(error.message)
    throw new Error(error.message)
  }
}

export async function fetchMemberDecks(): Promise<Deck[]> {
  const member_id = useMemberStore().id
  const end_of_day = DateTime.now().endOf('day').toISO()

  const { data, error } = await supabase
    .from('decks')
    .select('description,title, image_path, id, due_cards:cards(*, review:reviews(*))')
    .eq('member_id', member_id)
    .or(`id.is.null,due.lte.${end_of_day}`, { referencedTable: 'cards.reviews' })

  if (error) {
    Logger.error(error.message)
    throw new Error(error.message)
  }

  return data
}

export async function fetchDeckById(id: number): Promise<Deck> {
  const { data, error } = await supabase
    .from('decks')
    .select('*, cards(*, review:reviews(*)), member:members(display_name)')
    .eq('id', id)
    .order('order', { ascending: false, referencedTable: 'cards' })
    .single()

  if (error) {
    Logger.error(error.message)
    throw new Error(error.message)
  }

  return data
}

export async function updateDeckById(id: number, deck: Deck): Promise<void> {
  const { error } = await supabase.from('decks').update(deck).eq('id', id)

  if (error) {
    Logger.error(error.message)
    throw new Error(error.message)
  }
}

export async function deleteDeckById(id: number): Promise<void> {
  const { error } = await supabase.from('decks').delete().eq('id', id)

  if (error) {
    Logger.error(error.message)
    throw new Error(error.message)
  }

  await deleteCardsByDeckId(id)
}
