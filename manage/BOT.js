const path = require("path");
const WhatsApp = require("../app/WhatsApp");

const bot = new WhatsApp(path.join(__dirname, "session.json"));

bot.listenMessage(async (receive) => {
  const { isGroup, chat, from, body, readMessage, reply } = receive;
  // console.log({ receive });
  if (!isGroup) {
    // personal chat
    if (
      ["bro"].some((v) =>
        String(body).toLowerCase().startsWith(v)
      )
    ) {
      // await readMessage();
      await reply("iya broo...");
    } else if (
      ["bang"].some((v) => String(body).toLowerCase().includes(v))
    ) {
      await reply("iya bro...");
    } else if (String(body).toLowerCase() === "p") {
      await reply("baca salam sikit kalau wa tu...");
    } else if (
      ["halo", "hallo", "helo", "hello", "hai", "hay"].some(
        (v) => String(body).toLowerCase().split(" ")[0] === v
      )
    ) {
      const sapaan = String(body).split(" ")[0];
      await reply(`${sapaan} juga...`);
    } else if (
      ["asala", "assala"].some((v) => String(body).toLowerCase().startsWith(v))
    ) {
      await bot.sendTTS(
        reply,
        from,
        chat,
        "ar",
        "wa'alaikumsalam warahmatullahi wabarakatu",
        () => {
          console.log("ucapkan salam...");
        }
      );
    }
  } else {
    // grup
  }
});
