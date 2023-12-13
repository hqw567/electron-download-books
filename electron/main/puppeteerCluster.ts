import { app } from 'electron'
import fs from 'fs'
import https from 'https'
import path from 'path'
import { KnownDevices, Page, ScreenshotClip } from 'puppeteer'
import { Cluster } from 'puppeteer-cluster'

const downloadsPath = app.getPath('downloads')
const device = {
  width: 390,
  height: 844,
  scale: 3,
}

const iPhone12Pro = KnownDevices['iPhone 12 Pro']

const run = async (page: Page, url: string) => {
  await page.setViewport({
    width: device.width,
    height: device.height,
    deviceScaleFactor: device.scale,
  })
  await page.emulate(iPhone12Pro)
  await page.goto(updatePageParam(url, 999), { waitUntil: 'networkidle0' })

  const hasScalePageId = await page.$$eval('[id^="scalePage"]', (elements) => elements.length > 0)
  if (!hasScalePageId) {
    return
  }

  const title = await page.title()

  // 确保标题是一个有效的文件名
  const safeTitle = title.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_')
  // const urlName = url.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_')

  const uploadDirPath = path.join(downloadsPath, 'iceCoffee/kids-books', safeTitle + '___' + Date.now())

  if (!fs.existsSync(uploadDirPath)) {
    fs.mkdirSync(uploadDirPath, { recursive: true })
  }

  // const totalPage = await page.evaluate(() => {
  //   const element = document.querySelector('[id^="scalePage"]')
  //   if (element) {
  //     return parseInt(element.id.replace('scalePage', ''), 10) + 1
  //   }
  //   return -1
  // })
  const totalPage = await page.evaluate(() => {
    const p = new URLSearchParams(window.location.hash.substring(1)).get('p')
    return p ? +p : -1
  })

  // 获取总页数后改变#p=1
  await page.evaluate(() => {
    window.location.hash = 'p=1'
  })

  // 等待所有网络请求完成
  await page.waitForNavigation({ waitUntil: 'networkidle0' })

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
          console.log('Downloaded and saved image to:', localFilePath)
        })
      })
      .on('error', (err) => {
        // 如果发生错误，删除不完整的文件，并抛出错误
        fs.unlink(localFilePath, () => {
          console.error(backgroundImageUrl, err.message)
        })
      })
  } else {
    console.log('No background image URL found.')
  }

  let currentPage = await page.evaluate(() => {
    const p = new URLSearchParams(window.location.hash.substring(1)).get('p')
    return p ? +p : -1
  })

  while (true) {
    if (currentPage > totalPage) {
      break
    }
    await new Promise((r) => setTimeout(r, 5000))

    const selector = `#scalePage${currentPage - 1}`

    try {
      await page.waitForSelector(selector)
      await page.screenshot({
        path: path.join(uploadDirPath, `${safeTitle}-${currentPage}.png`),
        type: 'png', // 指定截图类型为 PNG
        clip: (await page.evaluate((sel: string) => {
          const element = document.querySelector(sel)
          if (element) {
            const { x, y, width, height } = element?.getBoundingClientRect()
            return { x, y, width, height }
          }
          return null
        }, selector)) as ScreenshotClip,
      })
    } catch (error: any) {
      console.error(error.message)
    }

    // 键盘翻页
    await page.keyboard.press('ArrowRight')

    currentPage++
  }
}

function updatePageParam(url: string, newPageNumber: number) {
  // 正则表达式用于查找#p=后跟一个或多个数字
  const pageParamRegex = /(#p=)(\d+)/
  const hasPageParam = pageParamRegex.test(url)

  if (hasPageParam) {
    // 如果存在#p=参数，则替换它
    return url.replace(pageParamRegex, `\$1${newPageNumber}`)
  } else {
    // 如果不存在#p=参数，则添加它
    // 需要检查URL中是否已经有#，如果有，直接添加p=999，否则添加#p=999
    return url.includes('#') ? `${url}p=${newPageNumber}` : `${url}#p=${newPageNumber}`
  }
}

const defaultClusterOptions = {
  maxConcurrency: 2,
  timeout: 1000 * 60 * 60,
  puppeteerOptions: {
    timeout: 1000 * 60 * 60,
    ignoreHTTPSErrors: true,
    headless: true,
    defaultViewport: null,
    args: [
      `--window-size=${device.width * 2},${device.height * 2}`,
      '--disable-extensions', // 禁用扩展，减少不必要的资源占用
      '--disable-gpu', // 禁用GPU加速，对于无头(headless)模式通常没有影响，但有时有助于避免某些问题
      '--no-sandbox', // 禁用沙盒模式，注意这会降低安全性，但在某些环境下（如CI服务器）可能是必要的
      '--disable-setuid-sandbox', // 同上，禁用沙盒的额外权限需求
      '--disable-dev-shm-usage', // 使用/tmp而不是/dev/shm，因为后者在某些环境中可能容量较小
      '--disable-accelerated-2d-canvas', // 禁用2D canvas加速，有助于稳定性和性能
      '--disable-infobars', // 防止显示Chrome信息栏，如“Chrome正在被自动化软件控制”的通知
      '--window-position=0,0', // 设置浏览器窗口的初始位置
      '--ignore-certificate-errors', // 忽略证书错误，对于测试自签名证书的站点很有用
      '--mute-audio', // 静音，适用于不需要声音输出的自动化测试
    ],
  },
}

async function createPuppeteerCluster({
  maxConcurrency = defaultClusterOptions.maxConcurrency,
  timeout = defaultClusterOptions.timeout,
  puppeteerOptions = defaultClusterOptions.puppeteerOptions,
} = {}) {
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: maxConcurrency,
    timeout: timeout,

    puppeteerOptions: puppeteerOptions,
  })

  await cluster.task(async ({ page, data: url }) => {
    await run(page, url)
  })

  cluster.on('taskerror', (err, data, willRetry) => {
    if (willRetry) {
      console.warn(`Encountered an error while crawling ${data}. ${err.message}\nThis job will be retried`)
    } else {
      console.error(`Failed to crawl ${data}: ${err.message}`)
    }
  })
  return cluster
}

// 关闭集群
async function closePuppeteerCluster(cluster: Cluster) {
  await cluster.idle()
  await cluster.close()
}

export { createPuppeteerCluster, closePuppeteerCluster, defaultClusterOptions }
