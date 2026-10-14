using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Threading;
[ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]class DeviceEnumerator {}
[ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IMMDeviceEnumerator {
 [PreserveSig]int EnumAudioEndpoints(int flow,uint mask,out IMMDeviceCollection devices);
 [PreserveSig]int GetDefaultAudioEndpoint(int flow,int role,out IMMDevice device);
 [PreserveSig]int GetDevice([MarshalAs(UnmanagedType.LPWStr)]string id,out IMMDevice device);
}
[ComImport,Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IMMDeviceCollection {
 [PreserveSig]int GetCount(out uint count);[PreserveSig]int Item(uint index,out IMMDevice device);
}
[ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IMMDevice {
 [PreserveSig]int Activate(ref Guid iid,uint ctx,IntPtr activation,[MarshalAs(UnmanagedType.IUnknown)]out object result);
 [PreserveSig]int OpenPropertyStore(uint mode,out IntPtr store);
 [PreserveSig]int GetId([MarshalAs(UnmanagedType.LPWStr)]out string id);
}
[ComImport,Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IAudioClient {
 [PreserveSig]int Initialize(int mode,uint flags,long duration,long periodicity,IntPtr format,ref Guid session);
 [PreserveSig]int GetBufferSize(out uint frames);
 [PreserveSig]int GetStreamLatency(out long latency);
 [PreserveSig]int GetCurrentPadding(out uint frames);
 [PreserveSig]int IsFormatSupported(int mode,IntPtr format,out IntPtr closest);
 [PreserveSig]int GetMixFormat(out IntPtr format);
 [PreserveSig]int GetDevicePeriod(out long def,out long min);
 [PreserveSig]int Start();[PreserveSig]int Stop();[PreserveSig]int Reset();
 [PreserveSig]int SetEventHandle(IntPtr handle);
 [PreserveSig]int GetService(ref Guid iid,[MarshalAs(UnmanagedType.IUnknown)]out object result);
}
[ComImport,Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IAudioCaptureClient {
 [PreserveSig]int GetBuffer(out IntPtr data,out uint frames,out uint flags,out ulong position,out ulong qpc);
 [PreserveSig]int ReleaseBuffer(uint frames);[PreserveSig]int GetNextPacketSize(out uint frames);
}
[ComImport,Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IAudioSessionManager2 {
 [PreserveSig]int GetAudioSessionControl(IntPtr guid,uint flags,out IntPtr control);
 [PreserveSig]int GetSimpleAudioVolume(IntPtr guid,uint flags,out IntPtr volume);
 [PreserveSig]int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
}
[ComImport,Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IAudioSessionEnumerator {
 [PreserveSig]int GetCount(out int count);
 [PreserveSig]int GetSession(int index,[MarshalAs(UnmanagedType.IUnknown)]out object session);
}
[ComImport,Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IAudioSessionControl2 {
 [PreserveSig]int GetState(out int state);
 [PreserveSig]int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)]out string name);
 [PreserveSig]int SetDisplayName(IntPtr name,IntPtr context);
 [PreserveSig]int GetIconPath(out IntPtr path);
 [PreserveSig]int SetIconPath(IntPtr path,IntPtr context);
 [PreserveSig]int GetGroupingParam(out Guid grouping);
 [PreserveSig]int SetGroupingParam(IntPtr grouping,IntPtr context);
 [PreserveSig]int RegisterAudioSessionNotification(IntPtr notification);
 [PreserveSig]int UnregisterAudioSessionNotification(IntPtr notification);
 [PreserveSig]int GetSessionIdentifier(out IntPtr identifier);
 [PreserveSig]int GetSessionInstanceIdentifier(out IntPtr identifier);
 [PreserveSig]int GetProcessId(out uint pid);
}
[ComImport,Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface ISimpleAudioVolume {
 [PreserveSig]int SetMasterVolume(float volume,IntPtr context);
 [PreserveSig]int GetMasterVolume(out float volume);
 [PreserveSig]int SetMute([MarshalAs(UnmanagedType.Bool)]bool mute,IntPtr context);
 [PreserveSig]int GetMute([MarshalAs(UnmanagedType.Bool)]out bool mute);
}
public static class YokogawaLoopback {
 public static string Probe(){var result="";for(int role=0;role<3;role++){IMMDevice device;Check(((IMMDeviceEnumerator)new DeviceEnumerator()).GetDefaultAudioEndpoint(0,role,out device));string id;Check(device.GetId(out id));Marshal.ReleaseComObject(device);result+="role="+role+" endpoint="+id+"\n";}return result;}
 static void Check(int result){Marshal.ThrowExceptionForHR(result);}
 public static string Sessions(){
  IMMDeviceCollection devices;Check(((IMMDeviceEnumerator)new DeviceEnumerator()).EnumAudioEndpoints(0,1,out devices));uint deviceCount;Check(devices.GetCount(out deviceCount));var lines="";
  for(uint d=0;d<deviceCount;d++){
  IMMDevice device;Check(devices.Item(d,out device));string deviceId;Check(device.GetId(out deviceId));lines+="endpoint="+deviceId+"\n";
  Guid iid=typeof(IAudioSessionManager2).GUID;object raw;Check(device.Activate(ref iid,23,IntPtr.Zero,out raw));var manager=(IAudioSessionManager2)raw;
  IAudioSessionEnumerator sessions;Check(manager.GetSessionEnumerator(out sessions));int count;Check(sessions.GetCount(out count));
  for(int i=0;i<count;i++){
   object session;Check(sessions.GetSession(i,out session));var control=(IAudioSessionControl2)session;uint pid;int state;Check(control.GetProcessId(out pid));Check(control.GetState(out state));
   var volume=(ISimpleAudioVolume)session;float level;bool mute;Check(volume.GetMasterVolume(out level));Check(volume.GetMute(out mute));
   lines+="pid="+pid+" state="+state+" volume="+level+" mute="+mute+"\n";Marshal.ReleaseComObject(session);
  }
  Marshal.ReleaseComObject(sessions);Marshal.ReleaseComObject(manager);Marshal.ReleaseComObject(device);
  }
  Marshal.ReleaseComObject(devices);return lines;
 }
 public static string Capture(string file,int seconds,string endpoint=null){
  if(seconds<1||seconds>120)throw new ArgumentOutOfRangeException("seconds");
  IMMDevice device;var enumerator=(IMMDeviceEnumerator)new DeviceEnumerator();Check(endpoint==null?enumerator.GetDefaultAudioEndpoint(0,1,out device):enumerator.GetDevice(endpoint,out device));Marshal.ReleaseComObject(enumerator);
  Guid clientId=typeof(IAudioClient).GUID;object raw;Check(device.Activate(ref clientId,23,IntPtr.Zero,out raw));var client=(IAudioClient)raw;
  IntPtr fmt;Check(client.GetMixFormat(out fmt));int channels=(ushort)Marshal.ReadInt16(fmt,2),rate=Marshal.ReadInt32(fmt,4),align=(ushort)Marshal.ReadInt16(fmt,12),bits=(ushort)Marshal.ReadInt16(fmt,14);
  int tag=(ushort)Marshal.ReadInt16(fmt,0);if(tag==65534)tag=Marshal.ReadInt32(fmt,24);
  Guid session=Guid.Empty;Check(client.Initialize(0,0x20000,10000000,0,fmt,ref session));Marshal.FreeCoTaskMem(fmt);
  Guid captureId=typeof(IAudioCaptureClient).GUID;Check(client.GetService(ref captureId,out raw));var capture=(IAudioCaptureClient)raw;
  int discontinuities=0,timestampErrors=0;long totalFrames=0;var pcm=new MemoryStream();var packets=new System.Text.StringBuilder("elapsedMs,frames,flags,devicePosition,qpc100ns\n");
  long startQpc=(long)(Stopwatch.GetTimestamp()*(10000000.0/Stopwatch.Frequency));var watch=Stopwatch.StartNew();Check(client.Start());
  Console.WriteLine("CAPTURE_READY unixMs="+((DateTime.UtcNow.Ticks-621355968000000000L)/10000));Console.Out.Flush();
  try{while(watch.Elapsed.TotalSeconds<seconds){
   uint pending;Check(capture.GetNextPacketSize(out pending));
   while(pending>0){
    IntPtr data;uint frames,flags;ulong pos,qpc;Check(capture.GetBuffer(out data,out frames,out flags,out pos,out qpc));
    var bytes=new byte[checked((int)frames*align)];if((flags&2)==0)Marshal.Copy(data,bytes,0,bytes.Length);
    // Release the device buffer before doing any file/timeline work.
    Check(capture.ReleaseBuffer(frames));
    if((flags&1)!=0)discontinuities++;if((flags&4)!=0)timestampErrors++;
    packets.Append(watch.ElapsedMilliseconds+","+frames+","+flags+","+pos+","+qpc+"\n");
    if((flags&4)==0){
     long target=(long)Math.Round(((long)qpc-startQpc)*rate/10000000.0);
     long gap=target-totalFrames;
     if(gap>0&&gap<rate*120L){var silence=new byte[checked((int)(gap*align))];pcm.Write(silence,0,silence.Length);totalFrames+=gap;}
    }
    pcm.Write(bytes,0,bytes.Length);totalFrames+=frames;
    Check(capture.GetNextPacketSize(out pending));
   }
   Thread.Sleep(5);
  }}
  finally{client.Stop();Marshal.ReleaseComObject(capture);Marshal.ReleaseComObject(client);Marshal.ReleaseComObject(device);}
  using(var writer=new BinaryWriter(File.Create(file))){var data=pcm.ToArray();writer.Write(System.Text.Encoding.ASCII.GetBytes("RIFF"));writer.Write(data.Length+36);writer.Write(System.Text.Encoding.ASCII.GetBytes("WAVEfmt "));writer.Write(16);writer.Write((short)tag);writer.Write((short)channels);writer.Write(rate);writer.Write(rate*align);writer.Write((short)align);writer.Write((short)bits);writer.Write(System.Text.Encoding.ASCII.GetBytes("data"));writer.Write(data.Length);writer.Write(data);}
  File.WriteAllText(file+".packets.csv",packets.ToString());
  return "sampleRate="+rate+" channels="+channels+" frames="+totalFrames+" discontinuities="+discontinuities+" timestampErrors="+timestampErrors+" elapsedMs="+watch.ElapsedMilliseconds;
 }
}

public class Program {
 public static int Main(string[] args) {
  try {
   if(args.Length==0 || args[0]=="--probe")Console.WriteLine(YokogawaLoopback.Probe());
   else if(args[0]=="--sessions")Console.WriteLine(YokogawaLoopback.Sessions());
   else if(args[0]=="--self-test"){
    Exception failure=null;string result=null;
    var thread=new Thread(()=>{try{result=YokogawaLoopback.Capture(args[2],6);}catch(Exception ex){failure=ex;}});
    thread.Start();Thread.Sleep(750);
    using(var player=new System.Media.SoundPlayer(args[1]))player.PlaySync();
    thread.Join();if(failure!=null)throw failure;Console.WriteLine(result);
   }else Console.WriteLine(YokogawaLoopback.Capture(args[0],args.Length>1?int.Parse(args[1]):10,args.Length>2?args[2]:null));
   return 0;
  }catch(Exception ex){Console.Error.WriteLine(ex.GetType().Name+": "+ex.Message+" HRESULT=0x"+ex.HResult.ToString("X8"));return 1;}
 }
}
