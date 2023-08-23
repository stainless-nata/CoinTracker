const notify = (client, channelId, msg, params) => {
    const channel = client.channels.cache.get(channelId);
    if(params.length) {
        channel.send({
            content: msg,
            tts: false,
            embeds: [
                {
                    type: "rich",
                    color: 0x00ffff,
                    fields: params,
                },
            ],
        });
    } else channel.send(msg);
}

export default notify;