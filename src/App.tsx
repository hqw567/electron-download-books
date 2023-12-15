import { useEffect, useState } from 'react'
import UpdateElectron from '@/components/update'

import { ipcRenderer, shell } from 'electron'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Toaster, toast } from 'react-hot-toast'
console.log('[App.tsx]', `Hello world from Electron ${process.versions.electron}!`)
import { Switch } from '@/components/ui/switch'

function App() {
  const [value, setValue] = useState('')
  const [logs, setLogs] = useState<any[]>([])

  useEffect(() => {
    const handleLogMessage = (event: any, data: any) => {
      setLogs((prevLogs) => [...prevLogs, data])
    }

    ipcRenderer.on('log-message', handleLogMessage)

    return () => {
      ipcRenderer.removeListener('log-message', handleLogMessage)
    }
  }, [])
  return (
    <div className="App flex    h-screen flex-col">
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
            查看保存目录
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
            提交任务进程（可多次提交）
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
          <Button
            onClick={() => {
              setLogs([])
            }}
          >
            清空日志
          </Button>
        </div>
      </div>
      <div className=" p-5  flex-1  space-y-2 divide-y divide-primary/50 overflow-auto  bg-primary/80">
        {logs.map((log, index) => {
          let rest: any
          try {
            rest = JSON.parse(log.restString)
          } catch (error) {}
          console.log('🚀 ~ file: App.tsx:85 ~ {logs.map ~ rest:', rest)
          return (
            <div
              key={index}
              className=" py-2 text-xs flex flex-col space-y-1 text-white"
            >
              <div className=" flex  space-x-2">
                <p>{log.timestamp}</p>
                <p className="uppercase font-bold">{log.level}</p>
              </div>
              <div className=" text-sm">
                <p>{log.message}</p>
              </div>
              <div>
                <p className="">{rest?.title}</p>
              </div>
              <div>
                {rest?.file && (
                  <p
                    title="点击打开"
                    className=" cursor-pointer text-orange-300"
                    onClick={() => {
                      shell.openPath(rest.file)
                    }}
                  >
                    {rest.file}
                  </p>
                )}
              </div>
              <div>
                {rest?.url && (
                  <a
                    title="点击打开链接"
                    className=" text-blue-300"
                    href={rest.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {rest.url}
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <Toaster />
    </div>
  )
}

export default App
