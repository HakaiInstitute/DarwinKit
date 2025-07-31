import { Link } from "@tanstack/react-router";
import { trpcReact } from "../../trpc";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { Chat } from "../../../server/db/schema";
import { router } from "../../router";
import { Route as IndexRoute } from "../";
import { Route as ChatRoute } from "../chat.$chatId";
import { useEffect } from "react";
import { Spinner } from "./Spinner";

export const Chats = () => {
  const chatsQuery = trpcReact.chats.useQuery();
  const chats = chatsQuery.data ?? [];

  return chats.map((chat) => <Chat chat={chat} key={chat.id} />);
};

const Chat = ({ chat }: { chat: Chat }) => {
  const utils = trpcReact.useUtils();
  const deleteChat = trpcReact.deleteChat.useMutation();
  const generateTitle = trpcReact.generateTitle.useMutation();

  const doDeleteChat = (id: string) => async (event: React.MouseEvent) => {
    // Prevent navigating to the chat as it's being deleted by stopping the
    // event from bubbling up to the Link component
    event.preventDefault();
    event.stopPropagation();

    deleteChat.mutateAsync({ id });
  };

  useEffect(() => {
    if (deleteChat.isSuccess) {
      utils.chats.invalidate();

      // Is the id we're deleting in the current path?
      const deletedCurrentChat = router.matchRoute({
        to: ChatRoute.path,
        params: { chatId: deleteChat.variables.id },
      });

      // Current chat was deleted; navigate to the root
      if (deletedCurrentChat) {
        router.navigate({ to: IndexRoute.path });
      }
    }
  }, [deleteChat, utils]);

  useEffect(() => {
    if (chat.title === null && generateTitle.isIdle) {
      generateTitle.mutateAsync({ chatId: chat.id }).then(() => {
        utils.chats.invalidate();
      });
    }
  }, [chat.title, chat.id, generateTitle, utils.chats]);

  return (
    <li key={chat.id}>
      <Link
        to={ChatRoute.path}
        params={{ chatId: String(chat.id) }}
        activeProps={{
          className: "text-white bg-red-500/50",
        }}
        inactiveProps={{
          className:
            "text-red-100 bg-white/5 hover:bg-white/15 hover:text-white",
        }}
        className={`group flex justify-between gap-x-3 rounded-md p-2 text-sm/6 font-semibold ${
          generateTitle.isPending ? "animate-pulse" : ""
        }`}
        viewTransition={{ types: ["slide"] }}
      >
        <span className="truncate">
          {chat.title ? chat.title : "Untitled..."}
        </span>{" "}
        <button
          onClick={doDeleteChat(chat.id)}
          className="cursor-pointer disabled:opacity-50 opacity-50 group-hover:opacity-75 group-active:opacity-75 hover:opacity-100"
          disabled={deleteChat.isPending && deleteChat.variables.id === chat.id}
        >
          {deleteChat.isPending ? (
            <Spinner className="h-4" />
          ) : (
            <XMarkIcon className="h-4 w-4 mr-2" />
          )}
        </button>
      </Link>
    </li>
  );
};
