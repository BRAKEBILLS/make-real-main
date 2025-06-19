/** MyScript 配置类型 (简化版) */
export interface TConfiguration {
  server: {
    protocol: 'REST'
    applicationKey: string
    hmacKey: string
    scheme: string
    host: string
    apiPath: string
  }
  recognition: {
    type: 'TEXT'
    lang: string
    text: {
      exports: {
        'application/vnd.myscript.jiix': {
          'bounding-box': boolean
          text: { chars: boolean; words: boolean }
        }
      }
    }
  }
}

export const REST_CONFIG: TConfiguration = {
  server: {
    protocol: 'REST',
    applicationKey: process.env.NEXT_PUBLIC_MYSCRIPT_APP_KEY!,
    hmacKey: process.env.MYSCRIPT_HMAC_KEY!,
    scheme: 'https',
    host: 'webdemoapi.myscript.com',
    apiPath: '/api/v4.0/iink',
  },
  recognition: {
    type: 'TEXT',
    lang: 'en_US',
    text: {
      exports: {
        'application/vnd.myscript.jiix': {
          'bounding-box': true,
          text: { chars: true, words: true },
        },
      },
    },
  },
} 