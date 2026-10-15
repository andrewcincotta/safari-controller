//
//  SafariWebExtensionHandler.swift
//  Safari Controller Extension
//
//  Created by Andrew Cincotta on 9/27/26.
//

import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, macOS 14.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = request?.userInfo?["profile"] as? UUID
        }

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        os_log(.default, "Received message from browser.runtime.sendNativeMessage: %@ (profile: %@)", String(describing: message), profile?.uuidString ?? "none")

        let responseMessage: [String: Any]
        let body = message as? [String: Any]
        switch body?["type"] as? String {
        case "getYabaiSpaces":
            responseMessage = yabaiSpaces(for: body?["windows"] as? [[String: Any]] ?? [])
        case "triggerSketchybar":
            responseMessage = triggerSketchybar()
        default:
            responseMessage = ["echo": message as Any]
        }

        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: responseMessage]
        } else {
            response.userInfo = ["message": responseMessage]
        }

        context.completeRequest(returningItems: [ response ], completionHandler: nil)
    }

    private func yabaiSpaces(for browserWindows: [[String: Any]]) -> [String: Any] {
#if os(macOS)
        do {
            let windows = try jsonArray(from: runYabai(arguments: ["-m", "query", "--windows"]))
            let spaces = try jsonArray(from: runYabai(arguments: ["-m", "query", "--spaces"]))
            let spaceDetails = Dictionary(uniqueKeysWithValues: spaces.compactMap { space -> (Int, (Int, String?))? in
                guard let id = space["id"] as? Int, let index = space["index"] as? Int else { return nil }
                let label = (space["label"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                return (id, (index, label))
            })

            var availableWindows = windows.filter { ($0["app"] as? String) == "Safari" }
            var result: [String: Any] = [:]
            for browserWindow in browserWindows {
                guard let id = browserWindow["id"], let title = browserWindow["title"] as? String,
                      let matchIndex = bestMatch(for: title, in: availableWindows) else { continue }
                let yabaiWindow = availableWindows.remove(at: matchIndex)
                guard let spaceID = yabaiWindow["space"] as? Int,
                      let (index, label) = spaceDetails[spaceID] else { continue }
                var value: [String: Any] = ["index": index]
                if let label { value["label"] = label }
                result[String(describing: id)] = value
            }
            return ["spaces": result]
        } catch {
            os_log(.error, "Could not query yabai: %@", error.localizedDescription)
            return ["spaces": [:], "error": error.localizedDescription]
        }
#else
        return ["spaces": [:]]
#endif
    }

    /// Fires sketchybar's `mission_control_refresh` event so bar items showing
    /// Safari window titles pick up a renamed window.
    private func triggerSketchybar() -> [String: Any] {
#if os(macOS)
        do {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: try findExecutable("sketchybar"))
            process.arguments = ["--trigger", "mission_control_refresh"]
            try process.run()
            return ["ok": true]
        } catch {
            os_log(.error, "Could not trigger sketchybar: %@", error.localizedDescription)
            return ["ok": false, "error": error.localizedDescription]
        }
#else
        return ["ok": false]
#endif
    }

#if os(macOS)
    private func findExecutable(_ name: String) throws -> String {
        let candidates = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"].map { "\($0)/\(name)" }
        guard let executable = candidates.first(where: FileManager.default.isExecutableFile(atPath:)) else {
            throw NSError(domain: "SafariController", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "\(name) was not found in /opt/homebrew/bin or /usr/local/bin."
            ])
        }
        return executable
    }

    private func runYabai(arguments: [String]) throws -> Data {
        let executable = try findExecutable("yabai")

        let process = Process()
        let output = Pipe()
        let errors = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = output
        process.standardError = errors
        try process.run()
        let data = output.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            let errorData = errors.fileHandleForReading.readDataToEndOfFile()
            let detail = String(data: errorData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
            let message = detail.flatMap { $0.isEmpty ? nil : $0 } ?? "yabai query failed."
            throw NSError(domain: "SafariController", code: Int(process.terminationStatus), userInfo: [
                NSLocalizedDescriptionKey: message
            ])
        }
        return data
    }

    private func jsonArray(from data: Data) throws -> [[String: Any]] {
        guard let array = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw NSError(domain: "SafariController", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "yabai returned unexpected JSON."
            ])
        }
        return array
    }

    private func bestMatch(for title: String, in windows: [[String: Any]]) -> Int? {
        if let exact = windows.firstIndex(where: { ($0["title"] as? String) == title }) { return exact }
        guard !title.isEmpty else { return nil }
        return windows.firstIndex { window in
            guard let nativeTitle = window["title"] as? String else { return false }
            return nativeTitle.contains(title) || title.contains(nativeTitle)
        }
    }
#endif

}
