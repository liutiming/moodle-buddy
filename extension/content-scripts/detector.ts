import { ExtensionOptions, ExtensionStorage } from "extension/types/extension.types"
import {
  ExecuteScriptMessage,
  Message,
  PageDataMessage,
  SetIconMessage,
  StateMessage,
} from "extension/types/messages.types"
import { PageData } from "extension/types/tracker.types"
import { getMoodleBaseURL, getURLRegex } from "../shared/helpers"
import { checkForMoodle } from "../shared/parser"

async function setDefaultMoodleURL(options: ExtensionOptions) {
  if (!options.autoSetMoodleURL) return

  const baseURL = getMoodleBaseURL(location.href)
  browser.storage.local.set({
    options: {
      ...options,
      defaultMoodleURL: `${baseURL}/my`,
    },
  })
}

async function runDetector() {
  let page = ""

  const isMoodlePage = checkForMoodle()

  if (isMoodlePage) {
    const dashboardPageRegex = getURLRegex("dashboard")
    const isDashboardPage = Boolean(location.href.match(dashboardPageRegex))

    const coursePageRegex = getURLRegex("course")
    const courseResourcesPageRegex = getURLRegex("courseResources")
    const isCoursePage = Boolean(
      location.href.match(coursePageRegex) || location.href.match(courseResourcesPageRegex)
    )

    const videoServicePageRegex = getURLRegex("videoservice")
    const isVideoServicePage = Boolean(location.href.match(videoServicePageRegex))

    if (isCoursePage) page = "course"
    if (isDashboardPage) page = "dashboard"
    if (isVideoServicePage) page = "videoservice"

    if (process.env.NODE_ENV === "debug") {
      const filename = location.href.split("/").pop()
      if (filename?.includes("course")) page = "course"
      if (filename?.includes("dashboard")) page = "dashboard"
    }
  }

  const isSupportedPage = page !== ""

  const localStorage: ExtensionStorage = await browser.storage.local.get()
  const { options, nUpdates, userHasRated, totalDownloadedFiles, rateHintLevel } = localStorage

  if (isSupportedPage) {
    browser.runtime.sendMessage<SetIconMessage>({
      command: "set-icon",
    })

    setDefaultMoodleURL(options)

    browser.runtime.sendMessage<ExecuteScriptMessage>({
      command: "execute-script",
      scriptName: page,
    })
  }

  const messageListener: browser.runtime.onMessageEvent = async (
    // eslint-disable-next-line @typescript-eslint/ban-types
    message: object
  ) => {
    const { command } = message as Message
    if (command === "get-state") {
      browser.runtime.sendMessage<StateMessage>({
        command: "state",
        page,
        options,
        nUpdates,
        userHasRated,
        totalDownloadedFiles,
        rateHintLevel,
      })

      if (isSupportedPage) {
        const pageData: PageData = {
          page,
          content: document.querySelector("html")?.outerHTML || "",
        }
        browser.runtime.sendMessage<PageDataMessage>({
          command: "page-data",
          pageData,
        })
      }
    }

    if (command === "rate-click") {
      await browser.storage.local.set({
        userHasRated: true,
      })
      runDetector()
    }

    if (command === "avoid-rate-click") {
      await browser.storage.local.set({
        rateHintLevel: rateHintLevel + 1,
      })
      runDetector()
    }
  }
  browser.runtime.onMessage.addListener(messageListener)
}

runDetector()
