import { handleReservationNotification } from '@/services/notifications/reservation'

export async function POST(request: Request) {
  return handleReservationNotification(request, 'reminder', 'customer')
}
