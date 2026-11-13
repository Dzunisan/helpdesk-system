export interface User {
    user_id: string;
    name: string;
    surname: string;
    email: string;
    password?: string;
    role: string;
    active: boolean;
    created_at: Date;
    department_id?: number | null;
    /** Set for accounts created with a temporary password: the app sends them to change it first (S1) */
    must_change_password?: boolean;
    last_login_at?: Date | null;
}

export interface CreateUserDto {
    user_id: string;
    name: string;
    surname: string;
    email: string;
    password?: string;
    role?: string;
    active?: boolean;
    department_id?: number | null;
}

export interface UpdateUserDto {
    name?: string;
    surname?: string;
    email?: string;
    password?: string;
    role?: string;
    active?: boolean;
    department_id?: number | null;
}

