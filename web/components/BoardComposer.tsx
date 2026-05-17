"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { User, ImageIcon, Paperclip, X, Loader2, FileText } from "lucide-react";

type BoardComposerProps = {
  examSlug: string;
  boardSlug: string;
};

type UploadedImage = {
  url: string;
  filename: string;
};

type UploadedFile = {
  url: string;
  filename: string;
};

export function BoardComposer({ examSlug, boardSlug }: BoardComposerProps) {
  const router = useRouter();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [authorName, setAuthorName] = useState("익명");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState("");
  const [accessToken, setAccessToken] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("access_token") ?? "";
    setIsLoggedIn(Boolean(token));
    if (token) {
      setAccessToken(token);
    }
    if (stored) {
      try {
        const user = JSON.parse(stored);
        if (typeof user.id === "string" && user.id) {
          setUserId(user.id);
        }
        if (user.nickname) {
          setAuthorName(user.nickname);
        } else if (user.username) {
          setAuthorName(user.username);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files;
    if (!inputFiles || inputFiles.length === 0) return;

    setIsUploading(true);
    setMessage("");

    for (const file of Array.from(inputFiles)) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (res.ok && data.url) {
          setImages((prev) => [...prev, { url: data.url, filename: data.filename }]);
        } else {
          setMessage(data.error || "업로드 실패");
        }
      } catch {
        setMessage("이미지 업로드 중 오류가 발생했습니다.");
      }
    }

    setIsUploading(false);
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files;
    if (!inputFiles || inputFiles.length === 0) return;

    setIsUploading(true);
    setMessage("");

    for (const file of Array.from(inputFiles)) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (res.ok && data.url) {
          setFiles((prev) => [...prev, { url: data.url, filename: data.filename }]);
        } else {
          setMessage(data.error || "업로드 실패");
        }
      } catch {
        setMessage("파일 업로드 중 오류가 발생했습니다.");
      }
    }

    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setTitle("");
    setContent("");
    setImages([]);
    setFiles([]);
  };

  const handleSubmit = async () => {
    setMessage("");
    if (!isLoggedIn || !userId || !accessToken) {
      setMessage("로그인 후 글을 작성할 수 있어요.");
      return;
    }
    const nameValue = isLoggedIn ? authorName.trim() : "익명";
    const titleValue = title.trim();
    let contentValue = content.trim();

    if (!titleValue) {
      setMessage("제목을 입력해 주세요.");
      return;
    }
    if (!contentValue && images.length === 0 && files.length === 0) {
      setMessage("내용을 입력해 주세요.");
      return;
    }

    // Append images to content
    if (images.length > 0) {
      const imageMarkdown = images.map((img) => `\n![${img.filename}](${img.url})`).join("");
      contentValue = contentValue + imageMarkdown;
    }

    // Append files as download links
    if (files.length > 0) {
      const fileMarkdown = files.map((f) => `\n📎 [${f.filename}](${f.url})`).join("");
      contentValue = contentValue + "\n\n**첨부파일:**" + fileMarkdown;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/posts/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          examSlug,
          boardSlug,
          authorName: nameValue,
          title: titleValue,
          content: contentValue,
          userId,
          accessToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error ?? "글 작성에 실패했습니다.");
        return;
      }
      resetForm();
      router.push(`/c/${examSlug}/${boardSlug}`);
    } catch {
      setMessage("글 작성 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Author info */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-medium text-gray-700">{isLoggedIn ? authorName : "익명"}</span>
      </div>

      {/* Title */}
      <div className="border-b border-gray-100">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목을 입력하세요"
          className="h-12 border-none rounded-none text-base font-medium focus-visible:ring-0 px-4"
        />
      </div>

      {/* Content */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="내용을 입력하세요..."
        className="w-full min-h-[200px] px-4 py-3 text-sm text-gray-800 resize-none outline-none placeholder:text-gray-400"
      />

      {/* Image Previews */}
      {images.length > 0 && (
        <div className="px-4 pb-2">
          <div className="text-xs text-gray-500 mb-2">이미지 ({images.length})</div>
          <div className="flex flex-wrap gap-2">
            {images.map((img, index) => (
              <div key={index} className="relative group">
                <img
                  src={img.url}
                  alt={img.filename}
                  className="h-20 w-20 object-cover rounded-lg border border-gray-200"
                />
                <button
                  onClick={() => removeImage(index)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="px-4 pb-3">
          <div className="text-xs text-gray-500 mb-2">첨부파일 ({files.length})</div>
          <div className="space-y-1">
            {files.map((file, index) => (
              <div key={index} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-2 group">
                <FileText className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-700 flex-1 truncate">{file.filename}</span>
                <button
                  onClick={() => removeFile(index)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3">
          {/* Image upload */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-primary disabled:opacity-50"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
            이미지
          </button>

          {/* File upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.zip,.txt"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-primary disabled:opacity-50"
          >
            <Paperclip className="h-4 w-4" />
            파일
          </button>

          {message && (
            <span className={`text-xs ${message.includes("실패") || message.includes("오류") ? "text-red-500" : "text-primary"}`}>
              {message}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (!isLoggedIn) {
              setMessage("로그인 후 글을 작성할 수 있어요.");
              router.push(`/signup?next=/c/${examSlug}/${boardSlug}`);
              return;
            }
            void handleSubmit();
          }}
          disabled={isSubmitting}
          className="h-10 rounded-lg bg-primary px-6 text-sm font-semibold text-white hover:bg-primary/90 disabled:bg-primary/40"
        >
          {isSubmitting ? "작성 중..." : isLoggedIn ? "글쓰기" : "로그인"}
        </button>
      </div>
    </div>
  );
}
