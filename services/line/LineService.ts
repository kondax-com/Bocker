import { LineMessage, LineMessageOptions } from './types'
import { MessageRepository } from './repositories/MessageRepository'
import { LineMessageRepository } from './repositories/LineMessageRepository'
import type { Message } from '@line/bot-sdk'
/**
 * LINE関連のサービスクラス
 * アプリケーションのユースケースを実装する
 */
export class LineService {
  private messageRepository: MessageRepository

  /**
   * コンストラクタ
   * @param messageRepository メッセージリポジトリの実装（DI用）
   */
  constructor(messageRepository?: MessageRepository) {
    // リポジトリの注入がなければデフォルト実装を使用（DIパターン）
    this.messageRepository = messageRepository || new LineMessageRepository()
  }

  /**
   * LINEメッセージを送信する
   * @param line_id 送信先のLINEユーザーID
   * @param message 送信するメッセージ内容
   * @param access_token LINEチャネルアクセストークン
   * @returns 送信結果の成否と結果メッセージ
   */
  async sendMessage(
    line_id: string,
    message: string,
    access_token: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // リクエストからドメインエンティティへの変換
      const lineMessage: LineMessage = {
        line_id,
        message,
      }

      const options: LineMessageOptions = {
        access_token,
      }

      // リポジトリを使用してメッセージを送信
      await this.messageRepository.sendMessage(lineMessage, options)

      return {
        success: true,
        message: 'メッセージが送信されました。',
      }
    } catch {
      console.error('LINE message delivery failed')
      return { success: false, message: 'メッセージ送信に失敗しました' }
    }
  }

  /**
   * LINE Flex Messageを送信する
   * @param line_id - 送信先のLINEユーザーID
   * @param messages - 送信するメッセージ配列（LINE Bot SDK形式）
   * @param access_token - LINEチャネルアクセストークン
   * @returns 送信結果の成否と結果メッセージ
   * @throws Error LINE API通信エラーの場合
   */
  async sendFlexMessage(
    line_id: string,
    messages: Message[],
    access_token: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const options: LineMessageOptions = {
        access_token,
      }

      await this.messageRepository.sendFlexMessage(line_id, messages, options)

      return {
        success: true,
        message: 'フレックスメッセージが送信されました。',
      }
    } catch {
      console.error('LINE Flex notification delivery failed')
      return { success: false, message: 'フレックスメッセージ送信に失敗しました' }
    }
  }
}
