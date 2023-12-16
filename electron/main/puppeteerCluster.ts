import { app } from 'electron'
import fs from 'fs'
import https from 'https'
import path, { join } from 'path'
import puppeteer, { Page, ScreenshotClip } from 'puppeteer'
import { Cluster } from 'puppeteer-cluster'
import logger from './logger'

const device = {
  width: 390,
  height: 844,
  scale: 4,
}

// const iPhone12Pro = KnownDevices['iPhone 12 Pro']
const iPhone12Pro = puppeteer.devices['iPhone 6']

const run = async (page: Page, url: string) => {
  await page.emulate(iPhone12Pro)
  await page.setViewport({
    width: device.width,
    height: device.height,
    deviceScaleFactor: device.scale,
  })
  await page.goto(updatePageParam(url, 999), { waitUntil: 'networkidle0' })

  const title = await page.title()
  const hasScalePageId = await page.$$eval('[id^="scalePage"]', (elements) => elements.length > 0)
  if (!hasScalePageId) {
    logger.info(`抱歉,暂不支持此页面，暂时只支持这种页面结构：https://online.fliphtml5.com/urcwv/ixuy/`, { url, title })
    return
  }
  // 确保标题是一个有效的文件名
  const safeTitle = title.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_')
  // const { name: appName } = (await import('package.json')).default

  const uploadDirPath = join(app.getPath('downloads'), `iceCoffee/book`, safeTitle + '___' + Date.now())

  if (!fs.existsSync(uploadDirPath)) {
    fs.mkdirSync(uploadDirPath, { recursive: true })
  }

  logger.info(`任务开始`, { url: page.url(), title })
  // await page.keyboard.press('ArrowLeft')
  // await new Promise((r) => setTimeout(r, 1000))
  // await page.keyboard.press('ArrowRight')

  // const totalPage = await page.evaluate(async () => {
  //   // window.location.hash = 'p=999'

  //   const p = new URLSearchParams(window.location.hash.substring(1)).get('p')
  //   return p ? +p : -1
  // })
  const totalPage = await page.evaluate(() => {
    const element = document.querySelector('[id^="scalePage"]')
    if (element) {
      return parseInt(element.id.replace('scalePage', ''), 10) + 1
    }
    return -1
  })

  logger.info(`共${totalPage}页`, { url: page.url(), title })

  // 获取背景图片URL
  const backgroundImageUrl = await page.evaluate(() => {
    const bacgradientElement = document.getElementById('bacgradient')
    const lastChild = bacgradientElement?.lastElementChild
    if (!lastChild) {
      return null
    }
    const backgroundImageStyle = window.getComputedStyle(lastChild).backgroundImage
    const urlMatch = backgroundImageStyle.match(/url\("([^"]+)"\)/)
    return urlMatch ? decodeURIComponent(urlMatch[1]) : null
  })

  // 保存背景图片
  if (backgroundImageUrl) {
    // 定义保存图片的本地路径和文件名
    const localFilePath = path.join(uploadDirPath, `${safeTitle}_background.png`)

    // 创建一个可写流来写入文件
    const file = fs.createWriteStream(localFilePath)

    // 发起GET请求下载图片
    https
      .get(backgroundImageUrl, (response) => {
        // 将图片数据流导入文件
        response.pipe(file)

        // 文件写入完成
        file.on('finish', () => {
          file.close()
          logger.info(`背景图片保存成功`, { url: page.url(), title, file: localFilePath })
        })
      })
      .on('error', (err) => {
        // 如果发生错误,删除不完整的文件,并抛出错误
        fs.unlink(localFilePath, () => {
          logger.error(`背景图片保存失败:${err.message}`, {
            url: page.url(),
            title,

            stack: err.stack,
            file: backgroundImageUrl,
          })
        })
      })
  } else {
    logger.info(`未获取到背景图片`, { url: page.url(), title })
  }
  await page.evaluate(async () => {
    window.location.hash = 'p=1'
  })
  await new Promise((r) => setTimeout(r, 1000))
  let currentPage = await page.evaluate(async () => {
    const p = new URLSearchParams(window.location.hash.substring(1)).get('p')
    return p ? +p : -1
  })

  await page.addStyleTag({
    content: `
    [class*="Shadow"], [class*="shadow"] {
      display: none !important;
    }
  `,
  })

  while (true) {
    if (currentPage > totalPage) {
      logger.info(`任务完成`, { url: page.url(), title })
      break
    }

    logger.info(`当前正在执行${currentPage}页,共${totalPage}页`, { url: page.url(), title })

    const selector = `#scalePage${currentPage - 1}`
    const maxRetries = 3
    async function screenshotWithRetry(page: Page, selector: string, savePath: string, retries: number = 0) {
      await screenshot(page, selector, savePath, {
        onSuccess: async (result) => {
          logger.info(`第${currentPage}页执行完成,图片保存成功`, { url: page.url(), title, file: result })
          // 成功后翻页
          await page.keyboard.press('ArrowRight')
          currentPage++
        },
        onFail: async (error) => {
          if (retries < maxRetries) {
            logger.warn(`第${currentPage}页截图失败，正在重试第${retries + 1}次`, {
              url: page.url(),
              stack: error.stack,
            })
            // 递增重试次数并再次尝试
            await screenshotWithRetry(page, selector, savePath, retries + 1)
          } else {
            logger.error(`第${currentPage}页执行失败,图片保存失败: ${error.message}`, {
              url: page.url(),
              title,
              stack: error.stack,
            })
          }
        },
      })
    }
    await screenshotWithRetry(page, selector, path.join(uploadDirPath, `${safeTitle}-${currentPage}.png`))
    // try {
    //   await page.waitForSelector(selector)
    //   const localFilePath = path.join(uploadDirPath, `${safeTitle}-${currentPage}.png`)
    //   await page.screenshot({
    //     path: localFilePath,
    //     type: 'png', // 指定截图类型为 PNG
    //     clip: (await page.evaluate((sel: string) => {
    //       const element = document.querySelector(sel)
    //       if (element) {
    //         const { x, y, width, height } = element?.getBoundingClientRect()
    //         return { x, y, width, height }
    //       }
    //       return null
    //     }, selector)) as ScreenshotClip,
    //   })

    //   logger.info(`第${currentPage}页执行完成,图片保存成功`, { url: page.url(), title, file: localFilePath })
    // } catch (error: any) {
    //   logger.error(`第${currentPage}页执行失败,图片保存失败:${error.message}`, {
    //     url: page.url(),
    //     title,

    //     stack: error.stack,
    //   })
    // }
  }
}

function updatePageParam(url: string, newPageNumber: number) {
  // 正则表达式用于查找#p=后跟一个或多个数字
  const pageParamRegex = /(#p=)(\d+)/
  const hasPageParam = pageParamRegex.test(url)

  if (hasPageParam) {
    // 如果存在#p=参数,则替换它
    return url.replace(pageParamRegex, `\$1${newPageNumber}`)
  } else {
    // 如果不存在#p=参数,则添加它
    // 需要检查URL中是否已经有#,如果有,直接添加p=999,否则添加#p=999
    return url.includes('#') ? `${url}p=${newPageNumber}` : `${url}#p=${newPageNumber}`
  }
}
function getChromiumExecPath() {
  return puppeteer.executablePath().replace('app.asar', 'app.asar.unpacked')
}
const defaultClusterOptions = {
  concurrency: Cluster.CONCURRENCY_CONTEXT,
  maxConcurrency: 2,
  timeout: 1000 * 60 * 60,
  puppeteerOptions: {
    executablePath: getChromiumExecPath(),
    timeout: 1000 * 60 * 60,
    ignoreHTTPSErrors: true,
    headless: true,
    defaultViewport: null,
    args: [
      '--no-zygote', // 禁用zygote进程,因为它会导致一些问题
      `--window-size=${device.width * 2},${device.height * 2}`,
      '--disable-extensions', // 禁用扩展,减少不必要的资源占用
      '--disable-gpu', // 禁用GPU加速,对于无头(headless)模式通常没有影响,但有时有助于避免某些问题
      '--no-sandbox', // 禁用沙盒模式,注意这会降低安全性,但在某些环境下（如CI服务器）可能是必要的
      '--disable-setuid-sandbox', // 同上,禁用沙盒的额外权限需求
      '--disable-dev-shm-usage', // 使用/tmp而不是/dev/shm,因为后者在某些环境中可能容量较小
      '--disable-accelerated-2d-canvas', // 禁用2D canvas加速,有助于稳定性和性能
      '--disable-infobars', // 防止显示Chrome信息栏,如“Chrome正在被自动化软件控制”的通知
      '--window-position=0,0', // 设置浏览器窗口的初始位置
      '--ignore-certificate-errors', // 忽略证书错误,对于测试自签名证书的站点很有用
      '--mute-audio', // 静音,适用于不需要声音输出的自动化测试
    ],
  },
}

async function createPuppeteerCluster(options = defaultClusterOptions) {
  const cluster = await Cluster.launch(options)

  await cluster.task(async ({ page, data: url }) => {
    await run(page, url)
  })

  cluster.on('taskerror', (err, data, willRetry) => {
    if (willRetry) {
      logger.info(`任务执行失败,正在重新尝试`, { url: data, message: err.message, stack: err.stack })
    } else {
      logger.error(`任务执行失败:${err.message}`, { url: data, stack: err.stack })
    }
  })
  return cluster
}

// 关闭集群
async function closePuppeteerCluster(cluster: Cluster) {
  // await cluster.idle()
  await cluster.close()
  logger.info(`所有任务已停止`)
}

export { createPuppeteerCluster, closePuppeteerCluster, defaultClusterOptions }

async function screenshot(
  page: Page,
  selector: string,
  savePath: string,
  {
    onSuccess,
    onFail,
  }: {
    onSuccess?: (result: any) => void
    onFail?: (error: any) => void
  } = {},
) {
  try {
    await new Promise((r) => setTimeout(r, 3000))
    await page.waitForSelector(selector)
    await page.screenshot({
      path: savePath,
      clip: (await page.evaluate((sel: string) => {
        const element = document.querySelector(sel)
        if (element) {
          const { x, y, width, height } = element?.getBoundingClientRect()
          return { x, y, width, height }
        }
        return null
      }, selector)) as ScreenshotClip,
    })

    await onSuccess?.(savePath)
  } catch (error: any) {
    await onFail?.(error)
  }
}
