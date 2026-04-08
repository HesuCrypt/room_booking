import React, { useState, useEffect } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Loader2, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';

type RoomConfig = {
  slug: string;
  id: string;
};

const ROOMS: RoomConfig[] = [
  { slug: 'meeting-room-a', id: 'Meeting Room A - conference room' },
  { slug: 'meeting-room-b', id: 'Meeting Room B - The one beside the room with bean bags' },
  { slug: 'meeting-room-c', id: 'Meeting Room C - with bean bags' },
  { slug: 'pod-1', id: 'Pod 1 - Near recep' },
  { slug: 'pod-2', id: 'Pod 2 - Near the door' },
  { slug: 'av-training-room', id: 'AV training room' }
];
const DEFAULT_ROOM_SLUG = ROOMS[0].slug;
const ROOM_BY_SLUG = ROOMS.reduce<Record<string, RoomConfig>>((acc, room) => {
  acc[room.slug] = room;
  return acc;
}, {});
const TIMES = [
  '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM',
  '06:00 PM', '07:00 PM'
];
const ALL_TIMES = [...TIMES, '08:00 PM'];

type Booking = {
  id: string;
  groupId: string;
  roomId: string;
  date: string;
  time: string;
  userName: string;
  purpose: string;
};

const getStartOfWeek = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatDate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={`/room/${DEFAULT_ROOM_SLUG}`} replace />} />
      <Route path="/room/:roomSlug" element={<RoomBookingPage />} />
      <Route path="*" element={<Navigate to={`/room/${DEFAULT_ROOM_SLUG}`} replace />} />
    </Routes>
  );
}

function RoomBookingPage() {
  const { roomSlug } = useParams<{ roomSlug: string }>();
  const selectedRoomConfig = roomSlug ? ROOM_BY_SLUG[roomSlug] : undefined;
  const selectedRoom = selectedRoomConfig?.id || '';
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [isRoomDropdownOpen, setIsRoomDropdownOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string, time: string, displayDate: string } | null>(null);
  const [userName, setUserName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [endTime, setEndTime] = useState('');
  const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly'>('none');
  const [recurrenceEnd, setRecurrenceEnd] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState(getStartOfWeek(new Date()));
  const [isLoading, setIsLoading] = useState(false);
  const [dbError, setDbError] = useState<{ message: string, code?: string } | null>(null);

  useEffect(() => {
    if (!selectedRoomConfig) return;

    const fetchBookings = async () => {
      setIsLoading(true);
      const startStr = formatDate(currentWeekStart);
      const endOfWeek = new Date(currentWeekStart);
      endOfWeek.setDate(endOfWeek.getDate() + 4); // Friday
      const endStr = formatDate(endOfWeek);

      try {
        const response = await fetch(`/api/bookings?roomId=${encodeURIComponent(selectedRoom)}&startDate=${startStr}&endDate=${endStr}`);
        if (!response.ok) {
          const errData = await response.json();
          throw { message: errData.error || 'Failed to fetch bookings', code: errData.code };
        }

        const data = await response.json();
        const mappedBookings: Booking[] = data.map((d: any) => ({
          id: d.id,
          groupId: d.group_id,
          roomId: d.room_id,
          date: d.date,
          time: d.time,
          userName: d.user_name,
          purpose: d.purpose
        }));
        setAllBookings(mappedBookings);
        setDbError(null);
      } catch (err: any) {
        console.error("Error fetching bookings:", err);
        setDbError({ message: err.message, code: err.code });
      } finally {
        setIsLoading(false);
      }
    };

    fetchBookings();
  }, [selectedRoom, selectedRoomConfig, currentWeekStart]);

  const bookings = allBookings.filter(b => b.roomId === selectedRoom);

  const getRoomAvailability = (room: string) => {
    const roomBookings = room === selectedRoom ? bookings : [];
    const totalSlotsPerWeek = 5 * TIMES.length;
    return totalSlotsPerWeek - roomBookings.length;
  };

  const weekDays = Array.from({ length: 5 }).map((_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const changeWeek = (offset: number) => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + offset * 7);
    setCurrentWeekStart(newDate);
  };

  const getBooking = (roomId: string, date: string, time: string) => {
    return bookings.find(b => b.roomId === roomId && b.date === date && b.time === time);
  };

  const openBookingModal = (date: string, time: string, displayDate: string) => {
    setSelectedSlot({ date, time, displayDate });
    const startIndex = TIMES.indexOf(time);
    setEndTime(ALL_TIMES[startIndex + 1]);
    setRecurrence('none');
    setRecurrenceEnd('');
    setUserName('');
    setPurpose('');
    setError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedSlot(null);
  };

  const getPreviewSlots = () => {
    if (!selectedSlot || !endTime) return [];
    const startIndex = TIMES.indexOf(selectedSlot.time);
    const endIndex = ALL_TIMES.indexOf(endTime);
    if (startIndex >= endIndex) return [];

    const dailyTimes = TIMES.slice(startIndex, endIndex);
    const slots: { date: string, time: string }[] = [];

    // Ensure we parse the dates in local time to avoid timezone shifts
    const parseDateLocal = (dateStr: string) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d);
    };

    let currentDate = parseDateLocal(selectedSlot.date);
    const endDate = recurrence !== 'none' && recurrenceEnd ? parseDateLocal(recurrenceEnd) : parseDateLocal(selectedSlot.date);

    // Safety limit: max 1 year
    const maxDate = parseDateLocal(selectedSlot.date);
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    const actualEndDate = endDate > maxDate ? maxDate : endDate;

    while (currentDate <= actualEndDate) {
      const dayOfWeek = currentDate.getDay();
      // Skip weekends for daily
      if (recurrence === 'daily' && (dayOfWeek === 0 || dayOfWeek === 6)) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const dateStr = formatDate(currentDate);
      dailyTimes.forEach(time => {
        slots.push({ date: dateStr, time });
      });

      if (recurrence === 'none') break;
      if (recurrence === 'daily') {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (recurrence === 'weekly') {
        currentDate.setDate(currentDate.getDate() + 7);
      }
    }
    return slots;
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !userName.trim() || !purpose.trim() || !endTime) return;

    const slotsToBook = getPreviewSlots();
    if (slotsToBook.length === 0) {
      setError('Invalid time range.');
      return;
    }

    const conflictingSlots = slotsToBook.filter(slot => getBooking(selectedRoom, slot.date, slot.time));
    if (conflictingSlots.length > 0) {
      setError(`Conflict: Some slots are already booked in the current view.`);
      return;
    }

    setError(null);
    setIsLoading(true);
    const groupId = Math.random().toString(36).substring(2, 11);

    const dbBookings = slotsToBook.map(slot => ({
      group_id: groupId,
      room_id: selectedRoom,
      date: slot.date,
      time: slot.time,
      user_name: userName.trim(),
      purpose: purpose.trim(),
    }));

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbBookings)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to book');
      }

      const data = await response.json();
      const mappedBookings: Booking[] = data.map((d: any) => ({
        id: d.id,
        groupId: d.group_id,
        roomId: d.room_id,
        date: d.date,
        time: d.time,
        userName: d.user_name,
        purpose: d.purpose
      }));
      setAllBookings([...allBookings, ...mappedBookings]);
      closeModal();
    } catch (err: any) {
      console.error("Error inserting bookings:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const bookingToDelete = bookings.find(b => b.id === id);
    if (bookingToDelete) {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/bookings/${bookingToDelete.groupId}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to delete');
        }

        setAllBookings(allBookings.filter(b => b.groupId !== bookingToDelete.groupId));
      } catch (err: any) {
        console.error("Error deleting bookings:", err);
        alert("Failed to delete: " + err.message);
      } finally {
        setIsLoading(false);
      }
    }
  };

  if (!selectedRoomConfig) {
    return <Navigate to={`/room/${DEFAULT_ROOM_SLUG}`} replace />;
  }

  if (dbError?.code === 'MISSING_SECRET' || dbError?.code === 'INVALID_SECRET') {
    return (
      <div className="min-h-screen bg-white text-black font-sans flex flex-col items-center justify-center p-6">
        <div className="max-w-xl w-full border-2 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-3 mb-6 border-b-2 border-black pb-4">
            <div className="bg-black text-white p-2">
              <CalendarIcon className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold uppercase tracking-tighter">Database Setup Required</h1>
          </div>

          <div className="space-y-6">
            <p className="font-medium text-lg leading-relaxed">
              To use the Room Booking System, you need to connect your Supabase PostgreSQL database.
            </p>

            <div className="bg-gray-50 border border-black p-4 space-y-4">
              <h2 className="font-bold uppercase tracking-widest text-sm">How to fix this:</h2>
              <ol className="list-decimal list-inside space-y-3 font-mono text-sm">
                <li>Open the <strong>Secrets</strong> panel in AI Studio (left sidebar).</li>
                <li>Click <strong>Add Secret</strong>.</li>
                <li>Set the Name to: <span className="bg-black text-white px-2 py-0.5 ml-1">DATABASE_URL</span></li>
                <li>Set the Value to your connection string.</li>
              </ol>
            </div>

            <div className="border-l-4 border-black pl-4 py-2">
              <p className="text-sm font-bold uppercase tracking-widest mb-1">Important:</p>
              <p className="text-sm">Make sure to replace <code className="bg-black text-white px-1">[YOUR-PASSWORD]</code> with your actual database password in the connection string.</p>
            </div>

            {dbError.code === 'INVALID_SECRET' && (
              <div className="bg-black text-white p-4 font-mono text-sm">
                Error: Your connection string still contains "[YOUR-PASSWORD]". Please update the secret with your real password.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-black p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold uppercase tracking-tighter">Room Booking</h1>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        </div>
        <div className="text-xs font-mono uppercase border border-black px-2 py-1">Internal</div>
      </header>

      {dbError && (
        <div className="bg-black text-white p-3 text-xs font-bold uppercase tracking-widest text-center">
          {dbError.message}
        </div>
      )}

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Sidebar / Room Selector */}
        <aside className="md:w-64 border-b md:border-b-0 md:border-r border-black flex-shrink-0 md:overflow-y-auto bg-white">
          <div className="p-4 border-b border-black hidden md:block">
            <h2 className="font-bold uppercase tracking-widest text-sm">Select Room</h2>
          </div>

          {/* Mobile Dropdown */}
          <div className="md:hidden p-4 border-b border-black">
            <label className="block text-xs font-bold uppercase tracking-widest mb-2">Select Room</label>
            <div className="relative">
              <button
                onClick={() => setIsRoomDropdownOpen(!isRoomDropdownOpen)}
                className="w-full flex items-center justify-between border border-black bg-white text-black p-3 font-bold uppercase tracking-widest rounded-none focus:outline-none focus:ring-2 focus:ring-black"
              >
                <div className="flex items-center gap-2">
                  <span>{selectedRoom}</span>
                  {getRoomAvailability(selectedRoom) > 0 ? (
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${isRoomDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isRoomDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 right-0 z-20 bg-white border border-t-0 border-black shadow-lg"
                  >
                    {ROOMS.map(room => {
                      const avail = getRoomAvailability(room.id);
                      return (
                        <NavLink
                          key={room.slug}
                          to={`/room/${room.slug}`}
                          onClick={() => setIsRoomDropdownOpen(false)}
                          className={({ isActive }) => `w-full text-left px-4 py-3 border-b border-black last:border-b-0 font-medium flex justify-between items-start gap-3 ${isActive ? 'bg-gray-100' : 'hover:bg-gray-50'
                            }`}
                        >
                          <span className="text-sm uppercase tracking-widest min-w-0 break-words leading-snug">{room.id}</span>
                          {avail > 0 ? (
                            <span className="text-[10px] bg-green-100 text-green-800 px-2 py-1 font-bold uppercase tracking-widest">Available</span>
                          ) : (
                            <span className="text-[10px] bg-red-100 text-red-800 px-2 py-1 font-bold uppercase tracking-widest">Full</span>
                          )}
                        </NavLink>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Desktop Buttons */}
          <div className="hidden md:flex md:flex-col">
            {ROOMS.map(room => {
              const avail = getRoomAvailability(room.id);
              return (
                <NavLink
                  key={room.slug}
                  to={`/room/${room.slug}`}
                  className={({ isActive }) => `px-4 py-3 border-b border-black text-left font-medium transition-colors min-h-[44px] flex justify-between items-start gap-3 ${isActive ? 'bg-black text-white' : 'bg-white text-black hover:bg-black hover:text-white'
                    }`}
                >
                  <span className="min-w-0 break-words leading-snug">{room.id}</span>
                  {avail > 0 ? (
                    <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${selectedRoom === room.id ? 'bg-green-400' : 'bg-green-500'}`}></span>
                  ) : (
                    <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${selectedRoom === room.id ? 'bg-red-400' : 'bg-red-500'}`}></span>
                  )}
                </NavLink>
              );
            })}
          </div>
        </aside>

        {/* Calendar View */}
        <main className="flex-1 p-4 md:p-8 overflow-auto">
          <div className="mb-6 flex flex-col xl:flex-row xl:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold uppercase tracking-tighter">{selectedRoom}</h2>
              <p className="text-sm uppercase tracking-widest mt-1">Weekly Schedule</p>
            </div>

            {/* Advanced Booking / Calendar Controls */}
            <div className="flex items-center gap-2 border border-black p-1 bg-white self-start xl:self-auto">
              <button onClick={() => changeWeek(-1)} className="p-2 hover:bg-black hover:text-white transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="relative flex items-center">
                <CalendarIcon className="w-4 h-4 absolute left-2 pointer-events-none" />
                <input
                  type="date"
                  value={formatDate(currentWeekStart)}
                  onChange={(e) => {
                    if (e.target.value) setCurrentWeekStart(getStartOfWeek(new Date(e.target.value)));
                  }}
                  className="pl-8 pr-2 py-2 text-sm font-bold uppercase tracking-widest outline-none bg-transparent cursor-pointer"
                />
              </div>
              <button onClick={() => changeWeek(1)} className="p-2 hover:bg-black hover:text-white transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Desktop Grid (hidden on mobile) */}
          <motion.div
            key={currentWeekStart.toISOString() + selectedRoom}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="hidden md:block border border-black"
          >
            <div className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-black bg-black text-white">
              <div className="p-2 border-r border-white font-bold uppercase tracking-widest text-[10px] flex items-center justify-center">Time</div>
              {weekDays.map(dateObj => (
                <div key={formatDate(dateObj)} className="p-2 border-r border-white last:border-r-0 font-bold text-center uppercase tracking-widest text-[10px] flex flex-col items-center justify-center">
                  <span>{formatDisplayDate(dateObj)}</span>
                </div>
              ))}
            </div>
            {TIMES.map(time => (
              <div key={time} className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-black last:border-b-0">
                <div className="p-2 border-r border-black font-mono text-[10px] flex items-center justify-center bg-white">
                  {time}
                </div>
                {weekDays.map(dateObj => {
                  const dateStr = formatDate(dateObj);
                  const displayDate = formatDisplayDate(dateObj);
                  const booking = getBooking(selectedRoom, dateStr, time);
                  return (
                    <div key={`${dateStr}-${time}`} className="border-r border-black last:border-r-0 p-1 min-h-[60px] relative">
                      {booking ? (
                        <motion.div
                          layoutId={`booking-${booking.id}`}
                          className="absolute inset-1 bg-black text-white p-1.5 flex flex-col justify-between group overflow-hidden"
                        >
                          <div>
                            <span className="font-bold text-[10px] block leading-tight truncate">{booking.userName}</span>
                            <span className="text-[9px] mt-0.5 block leading-tight truncate opacity-80">{booking.purpose}</span>
                          </div>
                          <button
                            onClick={() => handleDelete(booking.id)}
                            className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 bg-white text-black p-0.5 hover:bg-red-500 hover:text-white transition-all"
                            title="Cancel Booking"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </motion.div>
                      ) : (
                        <button
                          onClick={() => openBookingModal(dateStr, time, displayDate)}
                          className="h-full w-full flex items-center justify-center bg-white text-black hover:bg-gray-100 transition-colors group"
                        >
                          <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </motion.div>

          {/* Mobile Stacked View (hidden on desktop) */}
          <motion.div
            key={`mobile-${currentWeekStart.toISOString()}-${selectedRoom}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden flex flex-col gap-6"
          >
            {weekDays.map(dateObj => {
              const dateStr = formatDate(dateObj);
              const displayDate = formatDisplayDate(dateObj);
              return (
                <div key={dateStr} className="border border-black">
                  <div className="bg-black text-white p-3 font-bold text-center border-b border-black uppercase tracking-widest text-sm">
                    {displayDate}
                  </div>
                  <div className="flex flex-col">
                    {TIMES.map(time => {
                      const booking = getBooking(selectedRoom, dateStr, time);
                      return (
                        <div key={time} className="flex border-b border-black last:border-b-0 min-h-[60px]">
                          <div className="w-24 p-3 border-r border-black font-mono text-xs flex items-center justify-center shrink-0 bg-white">
                            {time}
                          </div>
                          <div className="flex-1 p-1 bg-white">
                            {booking ? (
                              <div className="h-full w-full bg-black text-white p-2 flex justify-between items-center">
                                <div className="flex flex-col">
                                  <span className="font-bold text-sm">{booking.userName}</span>
                                  <span className="text-xs">{booking.purpose}</span>
                                </div>
                                <button
                                  onClick={() => handleDelete(booking.id)}
                                  className="bg-white text-black p-2 border border-black active:bg-black active:text-white"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => openBookingModal(dateStr, time, displayDate)}
                                className="h-full w-full flex items-center justify-center bg-white text-black active:bg-black active:text-white transition-colors"
                              >
                                <span className="text-xs uppercase tracking-widest">Available</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            })}
          </motion.div>
        </main>
      </div>

      {/* Booking Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white/90 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white border-2 border-black w-full max-w-md p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6 border-b border-black pb-4">
                <h3 className="text-xl font-bold uppercase tracking-tighter">Book Room</h3>
                <button onClick={closeModal} className="p-2 bg-white text-black hover:bg-black hover:text-white border border-black transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-6 space-y-2 font-mono text-sm">
                <div className="flex justify-between border-b border-black pb-2">
                  <span className="uppercase">Room</span>
                  <span className="font-bold">{selectedRoom}</span>
                </div>
                <div className="flex justify-between border-b border-black pb-2">
                  <span className="uppercase">Date</span>
                  <span className="font-bold">{selectedSlot?.displayDate}</span>
                </div>
                <div className="flex justify-between border-b border-black pb-2 items-center">
                  <span className="uppercase">Time</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{selectedSlot?.time}</span>
                    <span>to</span>
                    <select
                      value={endTime}
                      onChange={e => { setEndTime(e.target.value); setError(null); }}
                      className="border border-black p-1 outline-none focus:ring-1 focus:ring-black bg-white text-black font-bold"
                    >
                      {selectedSlot && ALL_TIMES.slice(TIMES.indexOf(selectedSlot.time) + 1).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-between border-b border-black pb-2 items-center">
                  <span className="uppercase">Repeat</span>
                  <select
                    value={recurrence}
                    onChange={e => { setRecurrence(e.target.value as any); setError(null); }}
                    className="border border-black p-1 outline-none focus:ring-1 focus:ring-black bg-white text-black font-bold"
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily (Mon-Fri)</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>

                {recurrence !== 'none' && (
                  <div className="flex justify-between border-b border-black pb-2 items-center">
                    <span className="uppercase">End Date</span>
                    <input
                      type="date"
                      value={recurrenceEnd}
                      onChange={e => { setRecurrenceEnd(e.target.value); setError(null); }}
                      min={selectedSlot?.date}
                      className="border border-black p-1 outline-none focus:ring-1 focus:ring-black bg-white text-black font-bold"
                    />
                  </div>
                )}

                {/* Clear indication of selected slots */}
                {selectedSlot && endTime && (
                  <div className="bg-gray-50 border border-black p-3 mt-4 text-xs tracking-widest uppercase">
                    <div className="font-bold mb-2 border-b border-black pb-1">
                      Booking Preview ({getPreviewSlots().length} slots)
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1 pr-2">
                      {Object.entries(
                        getPreviewSlots().reduce((acc, slot) => {
                          if (!acc[slot.date]) acc[slot.date] = [];
                          acc[slot.date].push(slot.time);
                          return acc;
                        }, {} as Record<string, string[]>)
                      ).map(([date, times]) => (
                        <div key={date} className="flex justify-between">
                          <span>{date}</span>
                          <span className="opacity-70">{times.length} slot(s)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="border-2 border-black p-3 mt-4 text-xs tracking-widest uppercase font-bold bg-white text-black whitespace-pre-wrap">
                    {error}
                  </div>
                )}
              </div>

              <form onSubmit={handleBook} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold uppercase mb-2">User Name</label>
                  <input
                    required
                    type="text"
                    value={userName}
                    onChange={e => setUserName(e.target.value)}
                    className="w-full border border-black p-3 outline-none focus:ring-1 focus:ring-black min-h-[44px] bg-white text-black"
                    placeholder="ENTER YOUR NAME"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold uppercase mb-2">Purpose</label>
                  <input
                    required
                    type="text"
                    value={purpose}
                    onChange={e => setPurpose(e.target.value)}
                    className="w-full border border-black p-3 outline-none focus:ring-1 focus:ring-black min-h-[44px] bg-white text-black"
                    placeholder="MEETING PURPOSE"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-black text-white font-bold uppercase tracking-widest p-4 hover:bg-gray-800 border border-black transition-colors min-h-[44px] mt-4 disabled:opacity-50"
                >
                  {isLoading ? 'Booking...' : 'Confirm Booking'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
