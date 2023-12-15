import { app } from 'electron'
import * as winston from 'winston'
import * as path from 'path'
import DailyRotateFile from 'winston-daily-rotate-file'
import { win } from './index'
// 创建日志文件的路径
const logFilePath = path.join(app.getPath('downloads'), `iceCoffee/book/logs`)

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.printf((info) => {
      const { timestamp, level, message, ...rest } = info
      // 创建按字母顺序排列的键的数组
      const sortedKeys = Object.keys(rest).sort()

      // 使用排序后的键来创建一个新的有序对象
      const sortedRest = sortedKeys.reduce((obj: any, key) => {
        obj[key] = rest[key]
        return obj
      }, {})

      // 将有序对象转换为格式化的多行字符串
      const restString = sortedKeys.length > 0 ? `\n${JSON.stringify(sortedRest, null, 2)}` : ''
      const r = `${timestamp} ${level}: ${message} ${restString}`
      if (win && !win.isDestroyed()) {
        win.webContents.send('log-message', { timestamp, level, message, restString: restString.replace(/\n/, '') })
      }
      return r
    }),
  ),
  transports: [
    new winston.transports.Console(),
    new DailyRotateFile({
      filename: path.join(logFilePath, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d', // 保留14天的日志
      createSymlink: true,
      symlinkName: 'application-current.log',
    }),
  ],
})

export default logger
