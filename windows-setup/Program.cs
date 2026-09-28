using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Remi Magic — 요술봉 커서")]
[assembly: AssemblyDescription("현재 사용자의 Windows 마우스 커서를 적용하고 복원합니다.")]
[assembly: AssemblyVersion("1.3.1.0")]
[assembly: AssemblyFileVersion("1.3.1.0")]

namespace RemiMagic
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            if (args.Length > 0 && args[0] == "--self-test")
            {
                string report;
                int result = SelfTests.Run(out report);
                if (args.Length == 3 && args[1] == "--report") File.WriteAllText(args[2], report, new UTF8Encoding(true));
                else Console.WriteLine(report);
                return result;
            }
            if (args.Length > 0 && (args[0] == "--help" || args[0] == "/?"))
            {
                Console.WriteLine("Remi Magic 1.3.1 | --self-test [--report file] | --preview file.png\nNo parameters: open setup. Applying/restoring requires a button click. Self-test and preview never change Windows cursors.");
                return 0;
            }
            bool preview = args.Length == 2 && args[0] == "--preview";
            if (args.Length > 0 && !preview) return 2;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (preview)
            {
                using (SetupForm form = new SetupForm(null))
                using (Bitmap bitmap = new Bitmap(form.Width, form.Height))
                {
                    form.PreviewMode = true;
                    form.ShowInTaskbar = false;
                    form.Opacity = 0;
                    form.StartPosition = FormStartPosition.Manual;
                    form.Location = new Point(-32000, -32000);
                    form.Show();
                    Application.DoEvents();
                    form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, bitmap.Size));
                    bitmap.Save(Path.GetFullPath(args[1]), System.Drawing.Imaging.ImageFormat.Png);
                    form.Hide();
                }
                return 0;
            }
            string sid = WindowsIdentity.GetCurrent().User.Value;
            bool created;
            using (Mutex mutex = new Mutex(true, "Local\\RemiMagic.CursorSetup." + sid, out created))
            {
                if (!created)
                {
                    MessageBox.Show("이미 열려 있는 요술봉 창을 사용해 주세요.", "레미의 요술봉", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 0;
                }
                try
                {
                    string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RemiMagic");
                    FileStorage files = new FileStorage(root);
                    Application.Run(new SetupForm(new CursorService(new WindowsCursors(), files, files)));
                }
                catch (Exception ex)
                {
                    MessageBox.Show("요술봉 설정을 열지 못했어요.\n\n" + ex.Message, "레미의 요술봉", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }
                finally { mutex.ReleaseMutex(); }
            }
            return 0;
        }
    }

    internal sealed class CursorValue
    {
        public bool Exists;
        public RegistryValueKind Kind;
        public object Value;
        public static CursorValue Missing() { return new CursorValue { Exists = false, Kind = RegistryValueKind.None }; }
        public static CursorValue Text(string text) { return new CursorValue { Exists = true, Kind = RegistryValueKind.String, Value = text }; }
        public CursorValue Copy()
        {
            object copy = Value;
            if (Value is byte[]) copy = ((byte[])Value).Clone();
            if (Value is string[]) copy = ((string[])Value).Clone();
            return new CursorValue { Exists = Exists, Kind = Kind, Value = copy };
        }
    }

    internal sealed class CursorState
    {
        public static readonly string[] Names = { "Arrow", "Hand" };
        public readonly CursorValue[] Values;
        public CursorState(CursorValue arrow, CursorValue hand) { Values = new CursorValue[] { arrow, hand }; }
    }

    internal interface ICursorSettings
    {
        CursorState Read();
        void Write(string name, CursorValue value);
        void Reload();
    }
    internal interface IBackupStorage
    {
        byte[] ReadBackup();
        void SaveNewBackup(byte[] bytes);
        void DeleteBackup();
    }
    internal interface IAssets { string Install(bool large); }

    internal sealed class CursorService
    {
        private readonly ICursorSettings settings;
        private readonly IBackupStorage backup;
        private readonly IAssets assets;
        public CursorService(ICursorSettings settings, IBackupStorage backup, IAssets assets)
        { this.settings = settings; this.backup = backup; this.assets = assets; }

        public void Apply(bool large)
        {
            byte[] saved = backup.ReadBackup();
            if (saved != null) BackupCodec.Decode(saved); // Never replace an unreadable original.
            CursorState previous = settings.Read();
            string asset = assets.Install(large);
            if (saved == null) backup.SaveNewBackup(BackupCodec.Encode(previous));
            SetWithRollback(new CursorState(CursorValue.Text(asset), CursorValue.Text(asset)), previous);
        }

        public bool Restore()
        {
            byte[] saved = backup.ReadBackup();
            if (saved == null) return false;
            CursorState original = BackupCodec.Decode(saved);
            CursorState previous = settings.Read();
            SetWithRollback(original, previous);
            try { backup.DeleteBackup(); }
            catch (Exception ex) { throw new IOException("원래 커서는 복원했지만 백업 정리를 완료하지 못했어요. 다시 ‘원래 마우스로 돌리기’를 눌러 주세요.", ex); }
            return true;
        }

        private void SetWithRollback(CursorState state, CursorState previous)
        {
            try { WriteAll(state); settings.Reload(); }
            catch (Exception changeError)
            {
                List<Exception> rollbackErrors = new List<Exception>();
                for (int i = 0; i < CursorState.Names.Length; i++)
                    try { settings.Write(CursorState.Names[i], previous.Values[i]); }
                    catch (Exception ex) { rollbackErrors.Add(ex); }
                try { settings.Reload(); } catch (Exception ex) { rollbackErrors.Add(ex); }
                if (rollbackErrors.Count > 0)
                    throw new IOException("설정을 끝내지 못했고 일부 복구도 실패했어요. 원본 백업은 보관했습니다. ‘원래 마우스로 돌리기’로 다시 복원해 주세요.\n" + changeError.Message, new AggregateException(rollbackErrors));
                throw new IOException("설정을 끝내지 못해 변경 전 커서로 되돌렸어요. 원본 백업은 보관했습니다.\n" + changeError.Message, changeError);
            }
        }
        private void WriteAll(CursorState state)
        {
            for (int i = 0; i < CursorState.Names.Length; i++) settings.Write(CursorState.Names[i], state.Values[i]);
        }
    }

    internal static class BackupCodec
    {
        private const int MaxBytes = 8 * 1024 * 1024;
        private static readonly byte[] Header = Encoding.ASCII.GetBytes("REMICURSOR1");
        public static byte[] Encode(CursorState state)
        {
            byte[] payload;
            using (MemoryStream stream = new MemoryStream())
            using (BinaryWriter writer = new BinaryWriter(stream, Encoding.Unicode))
            {
                writer.Write(2);
                for (int i = 0; i < 2; i++)
                {
                    writer.Write(CursorState.Names[i]);
                    CursorValue value = state.Values[i];
                    writer.Write(value.Exists);
                    if (!value.Exists) continue;
                    writer.Write((int)value.Kind);
                    switch (value.Kind)
                    {
                        case RegistryValueKind.String:
                        case RegistryValueKind.ExpandString: writer.Write((string)value.Value); break;
                        case RegistryValueKind.DWord: writer.Write((int)value.Value); break;
                        case RegistryValueKind.QWord: writer.Write((long)value.Value); break;
                        case RegistryValueKind.MultiString:
                            string[] items = (string[])value.Value;
                            writer.Write(items.Length);
                            foreach (string item in items) writer.Write(item);
                            break;
                        case RegistryValueKind.Binary:
                        case RegistryValueKind.None:
                            byte[] data = (byte[])value.Value;
                            writer.Write(data.Length); writer.Write(data); break;
                        default: throw new InvalidDataException("지원하지 않는 원본 커서 설정 형식이어서 변경하지 않았어요.");
                    }
                }
                writer.Flush(); payload = stream.ToArray();
            }
            if (payload.Length > MaxBytes) throw new InvalidDataException("원본 커서 설정이 너무 커서 안전하게 보관할 수 없어요.");
            using (MemoryStream stream = new MemoryStream())
            using (BinaryWriter writer = new BinaryWriter(stream))
            using (SHA256 sha = SHA256.Create())
            {
                writer.Write(Header); writer.Write(payload.Length); writer.Write(sha.ComputeHash(payload)); writer.Write(payload);
                writer.Flush(); return stream.ToArray();
            }
        }
        public static CursorState Decode(byte[] data)
        {
            try
            {
                if (data.Length > MaxBytes + 64) throw new InvalidDataException();
                byte[] payload;
                using (BinaryReader reader = new BinaryReader(new MemoryStream(data)))
                using (SHA256 sha = SHA256.Create())
                {
                    if (!Equal(reader.ReadBytes(Header.Length), Header)) throw new InvalidDataException();
                    int length = reader.ReadInt32();
                    if (length < 1 || length > MaxBytes) throw new InvalidDataException();
                    byte[] digest = reader.ReadBytes(32);
                    payload = reader.ReadBytes(length);
                    if (payload.Length != length || reader.BaseStream.Position != data.Length || !Equal(digest, sha.ComputeHash(payload))) throw new InvalidDataException();
                }
                using (BinaryReader reader = new BinaryReader(new MemoryStream(payload), Encoding.Unicode))
                {
                    if (reader.ReadInt32() != 2) throw new InvalidDataException();
                    CursorValue[] values = new CursorValue[2];
                    for (int i = 0; i < 2; i++)
                    {
                        if (reader.ReadString() != CursorState.Names[i]) throw new InvalidDataException();
                        if (!reader.ReadBoolean()) { values[i] = CursorValue.Missing(); continue; }
                        RegistryValueKind kind = (RegistryValueKind)reader.ReadInt32();
                        object value;
                        switch (kind)
                        {
                            case RegistryValueKind.String:
                            case RegistryValueKind.ExpandString: value = reader.ReadString(); break;
                            case RegistryValueKind.DWord: value = reader.ReadInt32(); break;
                            case RegistryValueKind.QWord: value = reader.ReadInt64(); break;
                            case RegistryValueKind.MultiString:
                                int count = reader.ReadInt32();
                                if (count < 0 || count > 65536) throw new InvalidDataException();
                                string[] items = new string[count];
                                for (int j = 0; j < count; j++) items[j] = reader.ReadString();
                                value = items; break;
                            case RegistryValueKind.Binary:
                            case RegistryValueKind.None:
                                int bytes = reader.ReadInt32();
                                if (bytes < 0 || bytes > MaxBytes) throw new InvalidDataException();
                                byte[] raw = reader.ReadBytes(bytes);
                                if (raw.Length != bytes) throw new InvalidDataException();
                                value = raw; break;
                            default: throw new InvalidDataException();
                        }
                        values[i] = new CursorValue { Exists = true, Kind = kind, Value = value };
                    }
                    if (reader.BaseStream.Position != payload.Length) throw new InvalidDataException();
                    return new CursorState(values[0], values[1]);
                }
            }
            catch (Exception ex)
            {
                throw new InvalidDataException("원본 커서 백업이 손상되어 변경을 중단했어요. 백업을 덮어쓰거나 삭제하지 않았습니다.\n백업 위치: %LOCALAPPDATA%\\RemiMagic\\cursor-backup.dat", ex);
            }
        }
        public static bool Equal(byte[] a, byte[] b)
        {
            if (a.Length != b.Length) return false;
            for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) return false;
            return true;
        }
    }

    internal sealed class WindowsCursors : ICursorSettings
    {
        private const string KeyName = @"Control Panel\Cursors";
        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool SystemParametersInfo(uint action, uint parameter, IntPtr value, uint flags);
        public CursorState Read()
        {
            CursorValue[] values = new CursorValue[2];
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(KeyName, false))
            {
                for (int i = 0; i < 2; i++)
                {
                    object value = key == null ? null : key.GetValue(CursorState.Names[i], null, RegistryValueOptions.DoNotExpandEnvironmentNames);
                    values[i] = value == null ? CursorValue.Missing() : new CursorValue { Exists = true, Kind = key.GetValueKind(CursorState.Names[i]), Value = value };
                }
            }
            return new CursorState(values[0], values[1]);
        }
        public void Write(string name, CursorValue value)
        {
            if (name != "Arrow" && name != "Hand") throw new ArgumentException("Unknown cursor field.");
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(KeyName))
            {
                if (value.Exists) key.SetValue(name, value.Value, value.Kind);
                else key.DeleteValue(name, false);
                key.Flush();
            }
        }
        public void Reload()
        {
            const uint SPI_SETCURSORS = 0x0057;
            if (!SystemParametersInfo(SPI_SETCURSORS, 0, IntPtr.Zero, 0))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Windows가 커서 새로고침을 완료하지 못했어요.");
        }
    }

    internal sealed class FileStorage : IBackupStorage, IAssets
    {
        private readonly string root;
        private readonly string backupPath;
        public FileStorage(string root) { this.root = Path.GetFullPath(root); backupPath = Path.Combine(this.root, "cursor-backup.dat"); }
        private void CheckSafe(string path)
        {
            string full = Path.GetFullPath(path);
            if (full != root && !full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new IOException("저장 위치가 올바르지 않아요.");
            string current = full;
            while (current != null && (current.Equals(root, StringComparison.OrdinalIgnoreCase) || current.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)))
            {
                if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                    throw new IOException("저장 위치에 연결된 폴더 또는 파일이 있어 안전하게 변경할 수 없어요.");
                current = Path.GetDirectoryName(current);
            }
        }
        private void EnsureRoot() { CheckSafe(root); Directory.CreateDirectory(root); }
        public byte[] ReadBackup()
        {
            CheckSafe(backupPath);
            if (!File.Exists(backupPath)) return null;
            if (new FileInfo(backupPath).Length > 8 * 1024 * 1024 + 64) throw new InvalidDataException("원본 백업의 크기가 올바르지 않아 변경을 중단했어요.");
            return File.ReadAllBytes(backupPath);
        }
        public void SaveNewBackup(byte[] bytes)
        {
            EnsureRoot(); CheckSafe(backupPath);
            WriteNewAtomically(backupPath, bytes);
            BackupCodec.Decode(File.ReadAllBytes(backupPath));
        }
        private void WriteNewAtomically(string destination, byte[] bytes)
        {
            string temp = Path.Combine(root, "pending-" + Guid.NewGuid().ToString("N") + ".tmp");
            try
            {
                using (FileStream stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                { stream.Write(bytes, 0, bytes.Length); stream.Flush(true); }
                CheckSafe(destination);
                File.Move(temp, destination); // Fails instead of overwriting an existing backup or asset.
            }
            finally { if (File.Exists(temp)) File.Delete(temp); }
        }
        public void DeleteBackup() { CheckSafe(backupPath); File.Delete(backupPath); }
        public string Install(bool large)
        {
            EnsureRoot();
            byte[] bytes = ReadEmbedded(large);
            string hash;
            using (SHA256 sha = SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
            string directory = Path.Combine(root, "Cursors");
            CheckSafe(directory); Directory.CreateDirectory(directory);
            string path = Path.Combine(directory, (large ? "Remi-Wand-Large-" : "Remi-Wand-Regular-") + hash.Substring(0, 16) + ".ani");
            CheckSafe(path);
            if (File.Exists(path))
            {
                if (new FileInfo(path).Length != bytes.Length || !BackupCodec.Equal(bytes, File.ReadAllBytes(path))) throw new IOException("보관된 요술봉 파일이 원본과 달라 변경을 중단했어요.");
            }
            else WriteNewAtomically(path, bytes);
            return path;
        }
        internal static byte[] ReadEmbedded(bool large)
        {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(large ? "RemiMagic.WandLarge.ani" : "RemiMagic.WandRegular.ani"))
            {
                if (stream == null) throw new IOException("요술봉 파일을 찾지 못했어요. 설치 파일을 다시 받아 주세요.");
                using (MemoryStream result = new MemoryStream()) { stream.CopyTo(result); return result.ToArray(); }
            }
        }
    }

    internal sealed class SetupForm : Form
    {
        internal bool PreviewMode;
        protected override bool ShowWithoutActivation { get { return PreviewMode; } }
        private readonly CursorService service;
        private readonly Label status;
        private readonly Button apply;
        private readonly Button restore;
        public SetupForm(CursorService service)
        {
            this.service = service;
            Text = "레미의 요술봉 · 마우스에 마법을";
            ClientSize = new Size(560, 530);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(255, 249, 252);
            Font = new Font("맑은 고딕", 10F);
            AutoScaleMode = AutoScaleMode.Dpi;
            DrawLabel("✧  REMI MAGIC", 36, 28, 490, 28, 10, Color.FromArgb(170, 85, 123), FontStyle.Bold);
            DrawLabel("내 마우스에, 작은 마법", 34, 71, 495, 47, 24, Color.FromArgb(94, 42, 70), FontStyle.Bold);
            DrawLabel("요술봉을 적용하면 바로 사용할 수 있어요.\n이 창을 닫아도 요술봉은 그대로 남아요.", 37, 125, 485, 60, 11, Color.FromArgb(109, 83, 98), FontStyle.Regular);

            apply = MakeButton("✦  요술봉 적용하기", 36, 217, 488, 61, Color.FromArgb(190, 69, 119), Color.White);
            apply.Font = new Font("맑은 고딕", 13, FontStyle.Bold);
            apply.Click += delegate { RunAction(false); };
            restore = MakeButton("원래 마우스로 돌리기", 36, 291, 488, 46, Color.FromArgb(247, 232, 240), Color.FromArgb(116, 65, 91));
            restore.Click += delegate { RunAction(true); };
            status = DrawLabel("준비됐어요. 위의 분홍색 버튼을 눌러 주세요.", 38, 357, 486, 67, 10, Color.FromArgb(112, 76, 95), FontStyle.Regular);
            status.AccessibleName = "적용 결과";
            DrawLabel("Windows 10·11용  ·  일반 포인터와 링크 포인터에 적용\n표시 크기는 Windows 마우스 설정을 따라요.\n소리·잔상·캐릭터 변신은 포함하지 않아요.", 38, 438, 485, 70, 9, Color.FromArgb(125, 106, 117), FontStyle.Regular);
            AcceptButton = apply;
        }
        private Label DrawLabel(string text, int x, int y, int width, int height, float size, Color color, FontStyle style)
        {
            Label label = new Label { Text = text, Location = new Point(x, y), Size = new Size(width, height), ForeColor = color, Font = new Font("맑은 고딕", size, style) };
            Controls.Add(label); return label;
        }
        private Button MakeButton(string text, int x, int y, int width, int height, Color background, Color foreground)
        {
            Button button = new Button { Text = text, Location = new Point(x, y), Size = new Size(width, height), FlatStyle = FlatStyle.Flat, BackColor = background, ForeColor = foreground, Cursor = Cursors.Hand, UseVisualStyleBackColor = false };
            button.FlatAppearance.BorderSize = 0;
            Controls.Add(button); return button;
        }
        private void RunAction(bool restoring)
        {
            if (service == null) return;
            apply.Enabled = restore.Enabled = false;
            try
            {
                if (restoring)
                    status.Text = service.Restore() ? "원래 마우스로 돌아왔어요. 이제 이 창을 닫아도 돼요." : "복원할 변경이 없어요. 지금 마우스 설정을 그대로 유지했어요.";
                else { service.Apply(true); status.Text = "요술봉을 적용했어요! 바탕화면에서 마우스를 움직여 보세요.\n이 창을 닫아도 유지돼요. 되돌릴 때 이 파일을 다시 열어 주세요."; }
                status.ForeColor = Color.FromArgb(99, 77, 97);
            }
            catch (Exception ex)
            {
                status.Text = "변경하지 못했어요. 안내를 확인해 주세요.";
                MessageBox.Show(this, ex.Message, "설정을 확인해 주세요", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            finally { apply.Enabled = restore.Enabled = true; }
        }
    }

    internal static class SelfTests
    {
        private sealed class MemorySettings : ICursorSettings
        {
            public CursorState State = new CursorState(new CursorValue { Exists = true, Kind = RegistryValueKind.ExpandString, Value = @"%SystemRoot%\cursors\aero_arrow.cur" }, CursorValue.Missing());
            public int Writes, Reloads, FailWrite, FailReload;
            public CursorState Read() { return new CursorState(State.Values[0].Copy(), State.Values[1].Copy()); }
            public void Write(string name, CursorValue value)
            {
                Writes++;
                if (Writes == FailWrite) throw new IOException("simulated write failure");
                int i = Array.IndexOf(CursorState.Names, name);
                if (i < 0) throw new Exception("Unknown field mutated");
                State.Values[i] = value.Copy();
            }
            public void Reload() { Reloads++; if (Reloads == FailReload) throw new IOException("simulated reload failure"); }
        }
        private sealed class MemoryStorage : IBackupStorage, IAssets
        {
            public byte[] Backup;
            public int Saves;
            public bool FailSave;
            public byte[] ReadBackup() { return Backup == null ? null : (byte[])Backup.Clone(); }
            public void SaveNewBackup(byte[] bytes)
            {
                if (FailSave) throw new IOException("simulated backup failure");
                if (Backup != null) throw new IOException("backup already exists");
                Saves++; Backup = (byte[])bytes.Clone();
            }
            public void DeleteBackup() { Backup = null; }
            public string Install(bool large) { return large ? @"C:\mock\large.ani" : @"C:\mock\regular.ani"; }
        }
        private static void Assert(bool value, string message) { if (!value) throw new Exception(message); }
        private static void ExpectFailure(Action action) { bool failed = false; try { action(); } catch { failed = true; } Assert(failed, "Expected failure did not occur"); }
        private static bool Same(CursorState a, CursorState b) { return BackupCodec.Equal(BackupCodec.Encode(a), BackupCodec.Encode(b)); }
        public static int Run(out string report)
        {
            List<string> results = new List<string>();
            try
            {
                MemorySettings settings = new MemorySettings(); MemoryStorage storage = new MemoryStorage();
                CursorService service = new CursorService(settings, storage, storage);
                CursorState original = settings.Read();
                Assert(!service.Restore() && settings.Writes == 0 && settings.Reloads == 0, "Missing backup must be a no-op");
                results.Add("PASS: restore without backup makes no changes");
                service.Apply(true);
                Assert(storage.Saves == 1 && Same(original, BackupCodec.Decode(storage.Backup)), "First original was not preserved");
                Assert((string)settings.State.Values[0].Value == @"C:\mock\large.ani" && (string)settings.State.Values[1].Value == @"C:\mock\large.ani", "Apply must target only Arrow and Hand");
                results.Add("PASS: first apply preserves original value kinds and missing fields");
                byte[] firstBackup = storage.ReadBackup(); service.Apply(false);
                Assert(storage.Saves == 1 && BackupCodec.Equal(firstBackup, storage.Backup), "Reapply overwrote original");
                Assert((string)settings.State.Values[0].Value == @"C:\mock\regular.ani", "Size change failed");
                results.Add("PASS: reapply changes size without replacing original backup");
                Assert(service.Restore() && Same(original, settings.State) && storage.Backup == null, "Restore did not preserve exact fields");
                Assert(!service.Restore(), "Second restore must be a no-op");
                results.Add("PASS: restore recovers unexpanded paths and removes originally absent Hand");
                settings.State = new CursorState(CursorValue.Text(@"C:\custom\new-arrow.cur"), CursorValue.Text(@"C:\custom\new-hand.cur"));
                CursorState nextOriginal = settings.Read();
                service.Apply(true); service.Restore();
                Assert(Same(nextOriginal, settings.State), "New application session must preserve the newly chosen cursor scheme");
                results.Add("PASS: a later apply snapshots the current scheme after a previous restore");

                settings = new MemorySettings(); storage = new MemoryStorage(); service = new CursorService(settings, storage, storage);
                original = settings.Read(); settings.FailWrite = 2;
                ExpectFailure(delegate { service.Apply(true); });
                Assert(Same(original, settings.State) && storage.Backup != null, "Partial write rollback failed");
                results.Add("PASS: partial apply failure rolls back and retains recoverable original");
                settings = new MemorySettings(); storage = new MemoryStorage(); service = new CursorService(settings, storage, storage);
                original = settings.Read(); settings.FailReload = 1;
                ExpectFailure(delegate { service.Apply(true); });
                Assert(Same(original, settings.State) && settings.Reloads == 2, "Reload failure rollback failed");
                results.Add("PASS: reload failure restores previous cursor fields");

                settings = new MemorySettings(); storage = new MemoryStorage(); service = new CursorService(settings, storage, storage);
                service.Apply(true); CursorState applied = settings.Read(); settings.FailWrite = settings.Writes + 2;
                ExpectFailure(delegate { service.Restore(); });
                Assert(Same(applied, settings.State) && storage.Backup != null, "Failed restore must retain original");
                Assert(service.Restore(), "Restore retry failed");
                results.Add("PASS: interrupted restore can be safely retried");

                settings = new MemorySettings(); storage = new MemoryStorage(); service = new CursorService(settings, storage, storage);
                storage.Backup = BackupCodec.Encode(settings.Read()); storage.Backup[storage.Backup.Length - 1] ^= 1;
                byte[] damaged = storage.ReadBackup();
                ExpectFailure(delegate { service.Apply(true); }); ExpectFailure(delegate { service.Restore(); });
                Assert(settings.Writes == 0 && storage.Saves == 0 && BackupCodec.Equal(damaged, storage.Backup), "Damaged backup was overwritten");
                results.Add("PASS: corrupted backup blocks apply and restore without overwrite");
                storage = new MemoryStorage { FailSave = true }; service = new CursorService(settings, storage, storage);
                ExpectFailure(delegate { service.Apply(true); }); Assert(settings.Writes == 0, "Backup failure must prevent settings writes");
                results.Add("PASS: backup write failure blocks cursor changes");

                RegistryValueKind[] kinds = { RegistryValueKind.String, RegistryValueKind.ExpandString, RegistryValueKind.DWord, RegistryValueKind.QWord, RegistryValueKind.MultiString, RegistryValueKind.Binary, RegistryValueKind.None };
                object[] values = { "", "%SystemRoot%\\한글.cur", -1, long.MinValue, new string[] { "", "한글", "%PATH%" }, new byte[] { 0, 1, 255 }, new byte[] { 0, 42 } };
                for (int i = 0; i < kinds.Length; i++)
                {
                    CursorState state = new CursorState(new CursorValue { Exists = true, Kind = kinds[i], Value = values[i] }, CursorValue.Missing());
                    Assert(Same(state, BackupCodec.Decode(BackupCodec.Encode(state))), "Registry type roundtrip failed: " + kinds[i]);
                }
                results.Add("PASS: all supported registry value kinds round-trip exactly");

                string tempRoot = Path.Combine(Path.GetTempPath(), "RemiMagic-SelfTest-" + Guid.NewGuid().ToString("N"));
                try
                {
                    FileStorage disk = new FileStorage(tempRoot);
                    byte[] snapshot = BackupCodec.Encode(new MemorySettings().Read());
                    disk.SaveNewBackup(snapshot);
                    ExpectFailure(delegate { disk.SaveNewBackup(snapshot); });
                    Assert(BackupCodec.Equal(snapshot, disk.ReadBackup()), "Existing backup changed");
                    string largePath = disk.Install(true), regularPath = disk.Install(false);
                    Assert(BackupCodec.Equal(File.ReadAllBytes(largePath), FileStorage.ReadEmbedded(true)), "Large embedded asset mismatch");
                    Assert(BackupCodec.Equal(File.ReadAllBytes(regularPath), FileStorage.ReadEmbedded(false)), "Regular embedded asset mismatch");
                    Assert(disk.Install(true) == largePath, "Reinstall should reuse verified asset");
                    File.WriteAllText(largePath, "tampered");
                    ExpectFailure(delegate { disk.Install(true); });
                    disk.DeleteBackup(); Assert(disk.ReadBackup() == null, "Backup removal failed");
                    results.Add("PASS: isolated disk backup, embedded assets, reapply and tamper detection");
                }
                finally
                {
                    string tempParent = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                    string checkedRoot = Path.GetFullPath(tempRoot);
                    if (checkedRoot.StartsWith(tempParent, StringComparison.OrdinalIgnoreCase) && Path.GetFileName(checkedRoot).StartsWith("RemiMagic-SelfTest-", StringComparison.Ordinal) && Directory.Exists(checkedRoot)) Directory.Delete(checkedRoot, true);
                }
                report = String.Join(Environment.NewLine, results.ToArray()) + Environment.NewLine + "12 isolated checks passed. Windows registry and live cursor were not changed.";
                return 0;
            }
            catch (Exception ex) { report = String.Join(Environment.NewLine, results.ToArray()) + Environment.NewLine + "FAIL: " + ex; return 1; }
        }
    }
}
