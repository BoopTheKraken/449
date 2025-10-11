/*import { createContext, useEffect, useState, useContext } from "react";

const AuthContext = createContext()

export const AuthContextProvider = ({children}) => {
    const [session, setSession] = useState(undefined)

    return (
        <AuthContextProvider value={{session}}>
            {children}
        </AuthContextProvider>
    )
}

export const UserAuth = () => {
    return useContext(AuthContext)
}*/