import { useState } from 'react'
import UpdateElectron from '@/components/update'

import { ipcRenderer } from 'electron'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Toaster, toast } from 'react-hot-toast'
console.log('[App.tsx]', `Hello world from Electron ${process.versions.electron}!`)
import { Switch } from '@/components/ui/switch'

function App() {
  const [value, setValue] = useState('')
  return (
    <div className="App">
      <div className="  p-5 space-y-5">
        <div>
          <p className=" mb-2 font-bold">请输入需要截图的链接</p>
          <Input
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
            }}
          />
        </div>
        <div className=" flex flex-wrap  gap-2  ">
          <Button
            variant={'outline'}
            onClick={() => {
              ipcRenderer.send('open-kids-books-folder')
            }}
          >
            查看下载目录
          </Button>
          <Button
            disabled={!!!value}
            onClick={() => {
              const prefix = `https://online.fliphtml5.com/`
              if (!value.startsWith(prefix)) {
                toast.error(`不是一个有效的URL，请确保URL前缀为：${prefix}`)
                return
              }

              ipcRenderer.send('process-url', value)
              setValue('')
              toast.success('提交成功，请前往下载目录查看进度！')
            }}
          >
            提交任务进程
          </Button>
          <Button
            variant={'destructive'}
            onClick={() => {
              ipcRenderer.send('close-puppeteer-cluster')

              toast.success('任务已全部停止！')
            }}
          >
            停止所有任务
          </Button>
        </div>
      </div>
      <Toaster />
    </div>
  )
}

export default App
