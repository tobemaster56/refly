import React, { useEffect, useState } from "react"

// 静态资源
import Logo from "~assets/logo.svg"
import CloseGraySVG from "~assets/side/close.svg"
import NotificationSVG from "~assets/side/notification.svg"
import SettingGraySVG from "~assets/side/setting.svg"
import FullScreenSVG from "~assets/side/full-screen.svg"

// 组件
import {
  Avatar,
  List,
  Button,
  Skeleton,
  Message as message,
  Typography,
} from "@arco-design/web-react"
// stores
import { useSiderStore } from "~stores/sider"
import { useThreadStore, type Thread } from "~stores/thread"
import { IconTip } from "~components/home/icon-tip"
import {
  IconClockCircle,
  IconMessage,
  IconRightCircle,
} from "@arco-design/web-react/icon"
import type { PlasmoGetStyle } from "plasmo"
import { useNavigate, useMatch } from "react-router-dom"
import { sendToBackground } from "@plasmohq/messaging"
// utils
import { time } from "~utils/time"
import { useUserStore } from "~stores/user"
import { getClientOrigin } from "~utils/url"
// components
import { ChatHeader } from "~components/home/header"
import { EmptyThreadLibraryStatus } from "~components/empty-thread-library-status/index"
import { delay } from "~utils/delay"

const names = ["Socrates", "Balzac", "Plato"]
const avatarSrc = [
  "//p1-arco.byteimg.com/tos-cn-i-uwbnlip3yd/a8c8cdb109cb051163646151a4a5083b.png~tplv-uwbnlip3yd-webp.webp",
  "//p1-arco.byteimg.com/tos-cn-i-uwbnlip3yd/e278888093bef8910e829486fb45dd69.png~tplv-uwbnlip3yd-webp.webp",
  "//p1-arco.byteimg.com/tos-cn-i-uwbnlip3yd/9eeb1800d9b78349b24682c3518ac4a3.png~tplv-uwbnlip3yd-webp.webp",
]
const imageSrc = [
  "//p1-arco.byteimg.com/tos-cn-i-uwbnlip3yd/29c1f9d7d17c503c5d7bf4e538cb7c4f.png~tplv-uwbnlip3yd-webp.webp",
  "//p1-arco.byteimg.com/tos-cn-i-uwbnlip3yd/04d7bc31dd67dcdf380bc3f6aa07599f.png~tplv-uwbnlip3yd-webp.webp",
  "//p1-arco.byteimg.com/tos-cn-i-uwbnlip3yd/1f61854a849a076318ed527c8fca1bbf.png~tplv-uwbnlip3yd-webp.webp",
]
const dataSource = new Array(15).fill(null).map((_, index) => {
  return {
    id: index,
    index: index,
    avatar: avatarSrc[index % avatarSrc.length],
    title: names[index % names.length],
    description:
      "Beijing ByteDance Technology Co., Ltd. is an enterprise located in China. ByteDance has products such as TikTok, Toutiao, volcano video and Douyin (the Chinese version of TikTok).",
    imageSrc: imageSrc[index % imageSrc.length],
  }
})

export const ThreadLibrary = () => {
  const [scrollLoading, setScrollLoading] = useState(
    <Skeleton animation></Skeleton>,
  )
  const threadStore = useThreadStore()
  const navigate = useNavigate()
  const isThreadLibrary = useMatch("/thread")

  const fetchData = async (currentPage = 1) => {
    try {
      console.log("currentPage", currentPage)
      setScrollLoading(
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
          }}>
          <Skeleton animation style={{ width: "100%" }}></Skeleton>
          <Skeleton
            animation
            style={{ width: "100%", marginTop: 24 }}></Skeleton>
        </div>,
      )
      if (!threadStore?.hasMore && currentPage !== 1) {
        setScrollLoading(<span>已经到底啦~</span>)
        return
      }

      // await delay(30000)
      const newRes = await sendToBackground({
        name: "getConversationList",
        body: {
          page: currentPage,
          pageSize: 10,
        },
      })

      threadStore.updateCurrentPage(currentPage)
      if (newRes?.data?.length < threadStore?.pageSize) {
        threadStore.updateHasMore(false)
      }

      console.log("newRes", newRes)
      threadStore.updateThreadList(newRes?.data || [])
    } catch (err) {
      message.error("获取会话列表失败，请重新刷新试试")
    } finally {
      const { threads, pageSize } = useThreadStore.getState()

      if (threads?.length === 0) {
        setScrollLoading(<EmptyThreadLibraryStatus />)
      } else if (threads?.length > 0 && threads?.length < pageSize) {
        setScrollLoading(<span>已经到底啦~</span>)
      }
    }
  }

  useEffect(() => {
    fetchData()
  }, [isThreadLibrary])

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}>
      <ChatHeader />
      <List
        className="thread-library-list"
        wrapperStyle={{ width: "100%" }}
        bordered={false}
        header={<p className="thread-library-title">会话库</p>}
        pagination={false}
        offsetBottom={50}
        dataSource={threadStore?.threads}
        scrollLoading={scrollLoading}
        onReachBottom={(currentPage) => fetchData(currentPage)}
        noDataElement={<div>暂无数据</div>}
        render={(item: Thread, index) => (
          <List.Item
            key={index}
            style={{
              padding: "20px 0",
              borderBottom: "1px solid var(--color-fill-3)",
            }}
            actionLayout="vertical"
            actions={[
              <span
                key={1}
                className="thread-library-list-item-continue-ask with-border with-hover"
                onClick={() => {
                  navigate(`/thread/${item?.id}`)
                }}>
                <IconRightCircle style={{ fontSize: 14, color: "#64645F" }} />
                <span className="thread-library-list-item-text">继续提问</span>
              </span>,
              <span key={2}>
                <IconClockCircle style={{ fontSize: 14, color: "#64645F" }} />
                <span className="thread-library-list-item-text">
                  {time(item.updatedAt).utc().fromNow()}
                </span>
              </span>,
              <span key={3}>
                <IconMessage style={{ fontSize: 14, color: "#64645F" }} />
                <span className="thread-library-list-item-text">
                  {item?.messageCount} 条消息
                </span>
              </span>,
            ]}>
            <List.Item.Meta
              title={item.title}
              description={
                <Typography.Paragraph
                  ellipsis={{ rows: 2, wrapper: "span" }}
                  style={{ color: "rgba(0, 0, 0, .4) !important" }}>
                  {item.lastMessage}
                </Typography.Paragraph>
              }
            />
          </List.Item>
        )}
      />
    </div>
  )
}
