const notify = (client, channelId, msg) => {
    const channel = client.channels.cache.get(channelId);
    channel.send(msg);
}

export default notify;