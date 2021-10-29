const fs = require("fs");
const path = require("path");

const {
  WAConnection,
  MessageType,
  Presence,
  MessageOptions,
  Mimetype,
  WALocationMessage,
  WA_MESSAGE_STUB_TYPES,
  ReconnectMode,
  ProxyAgent,
  waChatKey,
} = require("@adiwajshing/baileys");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const googleTTS = require("google-tts-api");

class WhatsApp {
  /**
   * WhatsApp Bot (baileys)
   * @param {*} SESSION_DATA tempat menyimpan session file
   * @param {*} option {debug}
   */
  constructor(SESSION_DATA, option = {}) {
    const conn = new WAConnection();
    if (option.autoReconnect) {
      /**
       * onAllErrors
       * onConnectionLost // only automatically reconnect when the connection breaks
       */
      conn.autoReconnect = ReconnectMode[option.autoReconnect]; // specific
    } else {
      conn.autoReconnect = ReconnectMode.onAllErrors; // default
    }
    conn.connectOptions.maxRetries = 10000;
    if (option.debug) {
      conn.logger.level = "debug";
      conn.chatOrderingKey = waChatKey(true); // order chats such that pinned chats are on top
    }
    conn.on("open", async function () {
      fs.writeFileSync(
        SESSION_DATA,
        JSON.stringify(conn.base64EncodedAuthInfo(), null, "\t")
      ); // nyimpen sesi baru
    });
    if (fs.existsSync(SESSION_DATA)) {
      conn.loadAuthInfo(SESSION_DATA);
    }
    conn.on("close", ({ reason, isReconnecting }) => {
      if (option.debug) {
        console.log(
          "oh no got disconnected: " +
            reason +
            ", reconnecting: " +
            isReconnecting
        );
      }
      if (reason === "invalid_session") {
        this.logout(() => {
          conn.connect(); // reconnect
        });
      } else {
        if (option.reconnect) {
          conn.connect(); // reconnect
        }
      }
    });
    conn.connect(); // auto connect after declaration
    //
    this.conn = conn;
    this.SESSION_DATA = SESSION_DATA;
    this.blocked = [];

    this.option = option;
    this.bot_name = this.option.bot_name ? this.option.bot_name : "*From BOT*";
    this.prefix = this.option.prefix ? this.option.prefix : "!";
  }

  isArray(value) {
    return typeof value === "object" && Array.isArray(value) && value !== null;
  }
  isObject(value) {
    return typeof value === "object" && !Array.isArray(value) && value !== null;
  }
  templateItemNormal(text, before_enter = false) {
    const value_enter = before_enter ? "\n" : "";
    return `${value_enter}${text}${value_enter}\n`;
  }
  templateItemEnter() {
    return `\n`;
  }
  templateItemVariable(key, value, enter = false) {
    const value_enter = enter ? "\n" : "";
    let inject = "";
    if (this.isArray(value)) {
      inject += value
        .map((v) => {
          return v;
        })
        .join("\n");
    } else {
      if (this.isObject(value)) {
        inject += Object.values(value)
          .map((v) => {
            return v;
          })
          .join("\n");
      } else {
        inject += value;
      }
    }
    return `├ ${key} : ${value_enter + value_enter}${inject}\n${value_enter}`;
  }
  templateItemTitle(title, array = false) {
    const length = String(title).length;
    const alinyemen = 10 - length;
    const kanan_kiri = "=".repeat(alinyemen + length / 2);
    let print = `${kanan_kiri} ${title} ${kanan_kiri}\n\n`;
    if (array && this.isArray(array)) {
      print += array
        .map((v) => {
          return "- " + v + "\n";
        })
        .join("\n");
      print += "\n\n";
    }
    return print;
  }
  templateItemCommand(title, cmd, note = false) {
    const point_right = emoji.find("point_right").emoji;
    let inject = "";
    if (note) {
      inject += "\n";
      if (this.isArray(note)) {
        inject += note
          .map((v) => {
            return v;
          })
          .join("\n");
      } else {
        if (this.isObject(note)) {
          inject += Object.keys(note)
            .map((key) => {
              return key + " : " + note[key];
            })
            .join("\n");
        } else {
          inject += note;
        }
      }
    }
    const inject_cmd =
      String(cmd).length > 0 ? `\n${point_right} ${cmd}\n` : "";
    return `├ ${title} :${inject_cmd} ${inject}\n\n`;
  }
  templateItemList(key, array, enter = false) {
    if (this.isArray(array)) {
      const value_enter = enter ? "\n" : "";
      const inject = array
        .map((v) => {
          return "- " + v;
        })
        .join("\n");
      return `├ ${key} : ${value_enter}${value_enter}${inject}${value_enter}\n`;
    }
  }
  templateItemNext(text) {
    return `│ ${text}\n`;
  }
  templateFormat(title, text_array) {
    const text_inject = text_array.join("");
    return `┌─「 _*${title}*_ 」\n│\n${text_inject}│\n└─「 >> _*${this.bot_name}*_ << 」`;
  }
  // =================================================================
  async #deleteSession(onSuccess) {
    await fs.unlink(this.SESSION_DATA, (err) => {
      if (err) {
        console.error(err);
        return;
      } else {
        console.log("Session file deleted!");
        onSuccess();
      }
    });
  }
  async deleteFile(location, onSuccess) {
    await fs.unlink(location, (err) => {
      if (err) {
        console.error(err);
        return;
      } else {
        onSuccess();
      }
    });
  }
  #formatter(number, standard = "@c.us") {
    let formatted = number;
    // const standard = '@c.us'; // @s.whatsapp.net / @c.us
    if (!String(formatted).endsWith("@g.us")) {
      // isGroup ? next
      // 1. Menghilangkan karakter selain angka
      formatted = number.replace(/\D/g, "");
      // 2. Menghilangkan angka 62 di depan (prefix)
      //    Kemudian diganti dengan 0
      if (formatted.startsWith("0")) {
        formatted = "62" + formatted.substr(1);
      }
      // 3. Tambahkan standar pengiriman whatsapp
      if (!String(formatted).endsWith(standard)) {
        formatted += standard;
      }
    }
    return formatted;
  }
  generateRandomString(length = 20) {
    var result = "";
    var characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }
  getBuffer = async (url) => {
    const res = await fetch(url, {
      headers: { "User-Agent": "okhttp/4.5.0" },
      method: "GET",
    });
    const no_image = fs.readFileSync(
      path.join(__dirname, "..", "src", "no_image.jpg")
    );
    if (!res.ok) return { type: "image/jpeg", result: no_image };
    let buff = await res.buffer();
    if (buff) {
      const type = res.headers.get("content-type");
      if (type === "image/webp") {
        const new_buff = await sharp(buff).jpeg().toBuffer();
        buff = new_buff;
      }
      return { type, result: buff };
    }
  };
  getNameUser(member) {
    if (this.conn.user.jid === member.jid) {
      return this.bot_name;
    }
    return member.notify || member.vname || member.jid;
  }
  // =================================================================
  async reconnect() {
    await this.conn.connect(); // reconnect
  }
  /**
   *
   * @param {callback} onSuccess ketika selesai logout
   */
  async logout(onSuccess) {
    await this.#deleteSession(async () => {
      await this.conn.clearAuthInfo();
      setTimeout(async () => {
        try {
          await this.sendMessage(this.conn.user.jid, "logout....");
          onSuccess();
        } catch (error) {
          onSuccess();
        }
      }, 1000);
    });
  }
  // =================================================================
  //// Listen Family
  /**
   *
   * @param {*} value mendapatkan value dari QR agar bisa di lempar menjadi gambar di website
   */
  async listenQR(value) {
    this.conn.on("qr", (qr) => {
      // Now, use the 'qr' string to display in QR UI or send somewhere
      value(qr);
    });
  }

  messageLogger = []; //declare a variable to save message
  async listenMessage(receive) {
    /**
     * The universal event for anything that happens
     * New messages, updated messages, read & delivered messages, participants typing etc.
     */
    this.conn.on("chat-update", async (ct) => {
      let chat = ct;

      if (chat.presences) {
        // receive presence updates -- composing, available, etc.
        Object.values(chat.presences).forEach((presence) =>
          console.log(
            `${presence.name}'s presence is ${presence.lastKnownPresence} in ${chat.jid}`
          )
        );
      }

      const {
        text,
        extendedText,
        contact,
        location,
        liveLocation,
        image,
        video,
        sticker,
        document,
        audio,
        product,
        buttonsMessage,
      } = MessageType;

      // if (!chat.hasNewMessage) {
      //   try {
      //     if (
      //       JSON.parse(JSON.stringify(chat)).messages[0].messageStubType ==
      //       "REVOKE"
      //     ) {
      //       for (let i = 0; i <= this.messageLogger.length; i++) {
      //         if (
      //           JSON.parse(JSON.stringify(chat)).messages[0].key.id ==
      //           this.messageLogger[i].messages[0].key.id
      //         ) {
      //           const deleteHistory = this.messageLogger[i].messages[0];
      //           const deleteType = Object.keys(deleteHistory.message)[0];
      //           const messageUser = deleteHistory.key.remoteJid;
      //           const messagedeleted =
      //             deleteType === text
      //               ? deleteHistory.message.conversation
      //               : deleteType === extendedText
      //               ? deleteHistory.message.extendedTextMessage.caption
      //               : deleteType === video
      //               ? deleteHistory.message.videoMessage.caption
      //               : deleteType === image
      //               ? deleteHistory.message.imageMessage.text
      //               : deleteType === "buttonsResponseMessage"
      //               ? deleteHistory.message.buttonsResponseMessage.text
      //               : null;
      //           console.log("A message has been deleted: ", {
      //             messageUser,
      //             deleteHistory,
      //             messagedeleted,
      //           });
      //           if (!deleteHistory.key.fromMe) {
      //             if (deleteType === image) {
      //               const media = await this.conn.downloadAndSaveMediaMessage(
      //                 deleteHistory,
      //                 this.temp(deleteHistory.key.id)
      //               );
      //               const buffer = await fs.readFileSync(media);
      //               await this.sendImage(
      //                 messageUser,
      //                 buffer,
      //                 deleteHistory,
      //                 this.templateFormat("HAPUS GAMBAR", [
      //                   this.templateItemNormal(
      //                     `@${messageUser.split("@")[0]} : gambar apa hayooo`
      //                   ),
      //                 ]),
      //                 async () => {
      //                   await this.deleteFile(media, () => {
      //                     console.log("hapus gambar apa hayooo");
      //                   });
      //                 },
      //                 (error) => {
      //                   console.log({ error });
      //                 }
      //               );
      //             } else if (deleteType === sticker) {
      //               //
      //             } else if (deleteType === video) {
      //               //
      //             } else if (
      //               deleteType === text ||
      //               deleteType === extendedText
      //             ) {
      //               await this.conn
      //                 .sendMessage(
      //                   messageUser,
      //                   this.templateFormat("HAPUS PESAN", [
      //                     this.templateItemNormal(
      //                       `@${messageUser.split("@")[0]} : ${messagedeleted}`
      //                     ),
      //                   ]),
      //                   MessageType.text,
      //                   {
      //                     contextInfo: { mentionedJid: [messageUser] },
      //                     quoted: deleteHistory,
      //                   }
      //                 )
      //                 .then(() => {
      //                   console.log("hayoo hapus apa anda...");
      //                 });
      //             }
      //           }
      //         }
      //       }
      //     }
      //   } catch {}
      //   return;
      // } else {
      //   this.messageLogger.push(JSON.parse(JSON.stringify(chat)));
      // }

      if (!chat.hasNewMessage) return;
      chat = JSON.parse(JSON.stringify(chat)).messages[0];
      if (!chat.message) return;
      if (chat.key && chat.key.remoteJid == "status@broadcast") return;
      if (chat.key.fromMe) return;

      const content = JSON.stringify(chat.message);
      const from = chat.key.remoteJid;
      const type = Object.keys(chat.message)[0];
      const message_text = chat.message.conversation;
      const isGroup = from.endsWith("@g.us");
      const user_id = isGroup ? chat.participant : chat.key.remoteJid;
      const pushname =
        this.conn.contacts[user_id] != undefined
          ? this.conn.contacts[user_id].vname ||
            this.conn.contacts[user_id].notify
          : undefined;

      const isMedia = type === "imageMessage" || type === "videoMessage";
      const isQuotedImage =
        type === "extendedTextMessage" && content.includes("imageMessage");
      const isQuotedVideo =
        type === "extendedTextMessage" && content.includes("videoMessage");
      const isQuotedSticker =
        type === "extendedTextMessage" && content.includes("stickerMessage");

      const body_prefix =
        type === "conversation" &&
        chat.message.conversation.startsWith(this.prefix)
          ? chat.message.conversation
          : type == "imageMessage" &&
            chat.message.imageMessage.caption.startsWith(this.prefix)
          ? chat.message.imageMessage.caption
          : type == "videoMessage" &&
            chat.message.videoMessage.caption.startsWith(this.prefix)
          ? chat.message.videoMessage.caption
          : type == "extendedTextMessage" &&
            chat.message.extendedTextMessage.text.startsWith(this.prefix)
          ? chat.message.extendedTextMessage.text
          : "";
      let body =
        type === "conversation"
          ? chat.message.conversation
          : type === "extendedTextMessage"
          ? chat.message.extendedTextMessage.text
          : "";
      body = String(body).startsWith(this.prefix) ? null : body;
      var Link =
        type === "conversation" && chat.message.conversation
          ? chat.message.conversation
          : type == "imageMessage" && chat.message.imageMessage.caption
          ? chat.message.imageMessage.caption
          : type == "videoMessage" && chat.message.videoMessage.caption
          ? chat.message.videoMessage.caption
          : type == "extendedTextMessage" &&
            chat.message.extendedTextMessage.text
          ? chat.message.extendedTextMessage.text
          : "";
      const messagesLink = Link.slice(0)
        .trim()
        .split(/ +/)
        .shift()
        .toLowerCase();
      const command = body
        ? body.slice(0).trim().split(/ +/).shift().toLowerCase()
        : body_prefix.slice(0).trim().split(/ +/).shift().toLowerCase();
      const args = body
        ? body.trim().split(/ +/).slice(1)
        : body_prefix.trim().split(/ +/).slice(1);
      const Far = args.join(" ");
      const isCmd = body
        ? body.startsWith(this.prefix)
        : body_prefix.startsWith(this.prefix);

      const botNumber = this.conn.user.jid;
      const ownerNumber = ["6283144780782@s.whatsapp.net"]; // owner number ubah aja
      const sender = isGroup ? chat.participant : chat.key.remoteJid;
      const groupMetadata = isGroup ? await this.conn.groupMetadata(from) : "";
      const groupName = isGroup ? groupMetadata.subject : "";
      const groupId = isGroup ? groupMetadata.jid : "";
      const groupMembers = isGroup ? groupMetadata.participants : "";
      const groupDesc = isGroup ? groupMetadata.desc : "";
      const groupAdmins = isGroup ? getGroupAdmins(groupMembers) : "";
      const totalchat = await this.conn.chats.all();

      receive({
        chat,
        content,
        from,
        type,
        message_text,
        isGroup,
        user_id,
        pushname,
        body_prefix,
        body,
        Link,
        messagesLink,
        command,
        args,
        Far,
        isCmd,
        isMedia,
        isQuotedImage,
        isQuotedVideo,
        isQuotedSticker,
        reply: async (message) => {
          await this.conn.sendMessage(from, message, text, { quoted: chat });
        },
        readMessage: async () => {
          this.conn.chatRead(from);
        },
      });
    });
  }

  checkLimit = (sender) => {
    let found = false;
    for (let lmt of _limit) {
      if (lmt.id === sender) {
        limitCounts = limitt - lmt.limit;
        found = true;
      }
    }
    if (found === false) {
      let obj = { id: sender, limit: 1 };
      _limit.push(obj);
      fs.writeFileSync("./database/json/limit.json", JSON.stringify(_limit));
      this.conn.sendMessage(from, limitcount(limitCounts), text, {
        quoted: chat,
      });
    }
  };

  listenBattery(level) {
    this.conn.on("CB:action,,battery", (json) => {
      const batteryLevelStr = json[2][0][1].value;
      const batterylevel = parseInt(batteryLevelStr);
      console.log("battery level: " + batterylevel);
      level(batterylevel);
    });
  }

  /**
   *
   * @param {String} audio_location can send mp3, mp4, & ogg
   * @param {*} onSuccess callback
   */
  async sendAudio(number, quoted, audio_location, onSuccess) {
    await this.conn
      .sendMessage(
        this.#formatter(number),
        { url: audio_location },
        MessageType.audio,
        { mimetype: Mimetype.mp4Audio, quoted }
      )
      .then(async () => {
        await fs.unlinkSync(audio_location);
        if (onSuccess) onSuccess();
      });
  }

  async deleteFile(location, onSuccess) {
    await fs.unlink(location, (err) => {
      if (err) {
        console.error(err);
        return;
      } else {
        onSuccess();
      }
    });
  }

  // =================================================================

  sendback = {
    lang_not_available: async (sender, detail, lang) => {
      await this.reply(
        sender,
        detail,
        `maaf, untuk kode bahasa *${lang}* tidak tersedia!`,
        () => {
          console.log("language not available!");
        }
      );
    },
  };

  available_lang = [
    { af: "Afrikaans" },
    { sq: "Albanian" },
    { ar: "Arabic" },
    { hy: "Armenian" },
    { bn: "Bangladesh" },
    { bs: "Bosnian" },
    { bg: "Bulgarian" },
    { ca: "Spain" },
    { zh: "Mandarin" },
    { hr: "Croatian" },
    { cs: "Czech" },
    { da: "Denmark" },
    { nl: "Netherlands" },
    { en: "English" },
    { et: "Estonian" },
    { fi: "Finland" },
    { fr: "France" },
    { de: "Germany" },
    { el: "Greece" },
    { gu: "Gujarati" },
    { hi: "Hindi" },
    { hu: "Hungarian" },
    { is: "Iceland" },
    { id: "Indonesia" },
    { it: "Italian" },
    { ja: "Japanese" },
    { kn: "Kannada" },
    { km: "Cambodia" },
    { ko: "South Korea" },
    { lv: "Latvian" },
    { mk: "Macedonian" },
    { ms: "Malaysia" },
    { ml: "Malayalam" },
    { mr: "Marathi" },
    { ne: "Nepal" },
    { no: "Norwegian" },
    { pl: "Poland" },
    { pt: "Portuguese" },
    { ro: "Romanian" },
    { ru: "Russian" },
    { sr: "Serbian" },
    { si: "Sri Lanka" },
    { sk: "Slovakia" },
    { es: "Spanish" },
    { su: "Sundanese" },
    { sw: "Swahili" },
    { sv: "Swedish" },
    { ta: "Tamil" },
    { te: "Telugu" },
    { th: "Thailand" },
    { tr: "Turkey" },
    { uk: "Ukrainian" },
    { ur: "Urdu" },
    { vi: "Vietnamese" },
  ];

  // =================================================================
  //// Addon
  /**
   *
   * @param {String} lang
   * @param {String} text
   * @param {String} mp3_path
   * @param {*} lang_not_available
   */
  async getTTS(lang, text, mp3_path, lang_not_available = false) {
    const only_key = this.available_lang.map((v) => {
      return Object.keys(v)[0];
    });
    if (
      only_key.some((available) => {
        return available === lang;
      })
    ) {
      try {
        await googleTTS
          .getAudioBase64(text, { lang, slow: false })
          .then((base64) => {
            // save the audio file
            const buffer = Buffer.from(base64, "base64");
            const ran = this.generateRandomString();
            const locationSave = path.join(
              __dirname,
              "..",
              "temp",
              ran + ".mp3"
            );
            fs.writeFile(locationSave, buffer, { encoding: "base64" }, () => {
              mp3_path(locationSave);
            });
          })
          .catch((error) => {
            console.error(error);
            if (lang_not_available) lang_not_available();
          });
      } catch (error) {
        if (lang_not_available) lang_not_available();
      }
    } else {
      if (lang_not_available) lang_not_available();
    }
  }

  // =================================================================
  async sendTTS(reply, number, quoted, lang, text, onSuccess) {
    const lower_lang = String(lang).toLowerCase();
    await this.getTTS(
      lower_lang,
      text,
      (mp3_path) => {
        this.sendAudio(number, quoted, mp3_path, () => {
          this.deleteFile(mp3_path, () => {
            if (onSuccess) onSuccess();
          });
        });
      },
      async () => {
        await reply(`maaf, untuk kode bahasa *${lang}* tidak tersedia!`);
      }
    );
  }
}

module.exports = WhatsApp;
