import { messagingApi } from '@line/bot-sdk'
import { LineMessage, LineMessageOptions } from '../types'
import { MessageRepository } from './MessageRepository'
import type { Message } from '@line/bot-sdk'

const { MessagingApiClient } = messagingApi
// messagingApi.modelからMessageをインポート

/**
 * LINE APIを使用したメッセージリポジトリの実装
 */
export class LineMessageRepository implements MessageRepository {
  /**
   * LINEメッセージを送信する
   * @param message 送信するメッセージエンティティ
   * @param options メッセージ送信時のオプション
   * @returns 送信結果
   */
  async sendMessage(message: LineMessage, options: LineMessageOptions): Promise<boolean> {
    try {
      // LINE Messaging APIクライアントの初期化
      const client = new MessagingApiClient({
        channelAccessToken: options.access_token,
      })

      // メッセージの送信
      await client.pushMessage({
        to: message.line_id,
        messages: [
          {
            type: 'text',
            text: message.message,
          },
        ],
      })

      return true
    } catch {
      throw new Error('LINE message delivery failed')
    }
  }

  async sendFlexMessage(
    line_id: string,
    messages: Message[],
    options: LineMessageOptions
  ): Promise<boolean> {
    try {
      // LINE Messaging APIクライアントの初期化
      const client = new MessagingApiClient({
        channelAccessToken: options.access_token,
      })

      await client.pushMessage({
        to: line_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: messages as any,
      })

      return true
    } catch {
      throw new Error('LINE message delivery failed')
    }
  }
}
