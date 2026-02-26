using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace Curling.Hubs;

public class MultiplayerRoomManager
{
    private const int DefaultThinkTimeSeconds = 38 * 60;
    private readonly ConcurrentDictionary<string, MultiplayerRoom> rooms = new();
    private readonly ConcurrentDictionary<string, string> connectionToRoom = new();
    private readonly Random random = new();
    private readonly IHubContext<MultiplayerHub> hubContext;

    public MultiplayerRoomManager(IHubContext<MultiplayerHub> hubContext)
    {
        this.hubContext = hubContext;
    }

    public MultiplayerRoom CreateRoom(string hostConnectionId, string hostColor)
    {
        var roomId = Guid.NewGuid().ToString("N");
        var normalizedHostColor = NormalizeColor(hostColor);
        var guestColor = GetOppositeColor(normalizedHostColor);
        var startingColor = random.Next(0, 2) == 0 ? normalizedHostColor : guestColor;
        var room = new MultiplayerRoom(roomId, hostConnectionId, normalizedHostColor, guestColor, startingColor)
        {
            RemainingRedSeconds = DefaultThinkTimeSeconds,
            RemainingYellowSeconds = DefaultThinkTimeSeconds
        };
        rooms[roomId] = room;
        connectionToRoom[hostConnectionId] = roomId;
        return room;
    }

    public JoinRoomResult TryJoinRoom(string roomId, string connectionId, out MultiplayerRoom room)
    {
        if (!rooms.TryGetValue(roomId, out room))
        {
            return JoinRoomResult.NotFound;
        }

        lock (room.SyncRoot)
        {
            if (room.State != MultiplayerRoomState.WaitingForGuest)
            {
                return JoinRoomResult.AlreadyStarted;
            }

            if (room.GuestConnectionId != null || room.HostConnectionId == connectionId)
            {
                return JoinRoomResult.NotAvailable;
            }

            room.GuestConnectionId = connectionId;
            room.State = MultiplayerRoomState.Started;
            connectionToRoom[connectionId] = roomId;
            return JoinRoomResult.Success;
        }
    }

    public DisconnectionResult? HandleDisconnect(string connectionId)
    {
        if (!connectionToRoom.TryRemove(connectionId, out var roomId))
        {
            return null;
        }

        if (!rooms.TryGetValue(roomId, out var room))
        {
            return null;
        }

        lock (room.SyncRoot)
        {
            if (room.State == MultiplayerRoomState.Ended)
            {
                return null;
            }

            string? remainingConnectionId = null;
            if (room.HostConnectionId == connectionId)
            {
                remainingConnectionId = room.GuestConnectionId;
            }
            else if (room.GuestConnectionId == connectionId)
            {
                remainingConnectionId = room.HostConnectionId;
            }

            if (remainingConnectionId != null)
            {
                connectionToRoom.TryRemove(remainingConnectionId, out _);
            }

            room.State = MultiplayerRoomState.Ended;
            room.Timer?.Dispose();
            room.Timer = null;
            rooms.TryRemove(roomId, out _);
            return remainingConnectionId == null ? null : new DisconnectionResult(roomId, remainingConnectionId);
        }
    }

    public TimerUpdateResponse? StartTurn(string roomId, string activeColor)
    {
        if (!rooms.TryGetValue(roomId, out var room))
        {
            return null;
        }

        lock (room.SyncRoot)
        {
            if (room.State == MultiplayerRoomState.Ended)
            {
                return null;
            }

            room.RunningColor = NormalizeColor(activeColor);
            EnsureTimer(room);
            return BuildTimerUpdate(room);
        }
    }

    public TimerUpdateResponse? StopTurn(string roomId)
    {
        if (!rooms.TryGetValue(roomId, out var room))
        {
            return null;
        }

        lock (room.SyncRoot)
        {
            if (room.State == MultiplayerRoomState.Ended)
            {
                return null;
            }

            room.RunningColor = null;
            return BuildTimerUpdate(room);
        }
    }

    public TimerUpdateResponse? GetTimerUpdate(string roomId)
    {
        if (!rooms.TryGetValue(roomId, out var room))
        {
            return null;
        }

        lock (room.SyncRoot)
        {
            return BuildTimerUpdate(room);
        }
    }

    private void EnsureTimer(MultiplayerRoom room)
    {
        room.Timer ??= new Timer(async _ => await TickTimer(room), null, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(1));
    }

    private async Task TickTimer(MultiplayerRoom room)
    {
        TimerUpdateResponse? update = null;
        lock (room.SyncRoot)
        {
            if (room.State == MultiplayerRoomState.Ended || string.IsNullOrEmpty(room.RunningColor))
            {
                return;
            }

            if (room.RunningColor == "red")
            {
                room.RemainingRedSeconds = Math.Max(0, room.RemainingRedSeconds - 1);
                if (room.RemainingRedSeconds == 0)
                {
                    room.RunningColor = null;
                }
            }
            else
            {
                room.RemainingYellowSeconds = Math.Max(0, room.RemainingYellowSeconds - 1);
                if (room.RemainingYellowSeconds == 0)
                {
                    room.RunningColor = null;
                }
            }

            update = BuildTimerUpdate(room);
        }

        if (update != null)
        {
            await hubContext.Clients.Group(room.RoomId).SendAsync("TimerUpdate", update);
        }
    }

    private static string NormalizeColor(string color)
    {
        var normalized = (color ?? string.Empty).Trim().ToLowerInvariant();
        return normalized == "yellow" ? "yellow" : "red";
    }

    private static string GetOppositeColor(string color) => color == "red" ? "yellow" : "red";

    private static TimerUpdateResponse BuildTimerUpdate(MultiplayerRoom room)
        => new(room.RoomId, room.RemainingRedSeconds, room.RemainingYellowSeconds, room.RunningColor);
}

public class MultiplayerRoom(string roomId, string hostConnectionId, string hostColor, string guestColor, string startingColor)
{
    public string RoomId { get; } = roomId;
    public string HostConnectionId { get; } = hostConnectionId;
    public string HostColor { get; } = hostColor;
    public string GuestColor { get; } = guestColor;
    public string StartingColor { get; } = startingColor;
    public string? GuestConnectionId { get; set; }
    public int RemainingRedSeconds { get; set; }
    public int RemainingYellowSeconds { get; set; }
    public string? RunningColor { get; set; }
    public Timer? Timer { get; set; }
    public MultiplayerRoomState State { get; set; } = MultiplayerRoomState.WaitingForGuest;
    public object SyncRoot { get; } = new();
}

public enum MultiplayerRoomState
{
    WaitingForGuest,
    Started,
    Ended
}

public enum JoinRoomResult
{
    Success,
    NotFound,
    NotAvailable,
    AlreadyStarted
}

public record DisconnectionResult(string RoomId, string RemainingConnectionId);
public record TimerUpdateResponse(string RoomId, int RedSeconds, int YellowSeconds, string? RunningColor);
